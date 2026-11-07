import { Router, Request, Response } from "express";
import { z } from "zod";
import { AuthRequest, authMiddleware } from "../../core/auth-middleware";
import { HttpException } from "../../core/http-exception";
import { escapeRegex, objectIdSchema } from "../../core/object-id";
import { validateRequest } from "../../core/validate-request";
import { CATEGORIES, FOOD_STATUSES, IFood, Food } from "../../models/Food";
import { FoodRequest } from "../../models/FoodRequest";
import { IUser } from "../../models/User";

const router = Router();

const MAX_ACTIVE = 100;
const MAX_ACTIVE_DEMO = 10;
const MAX_DAYS_AHEAD = 60;

type Donor = Pick<IUser, "fullName" | "profileImageUrl" | "isDemo"> & { _id: unknown };

export const populateDonor = { path: "donor", select: "fullName profileImageUrl isDemo" };

/** What anyone may see about a listing. The donor's email is never part of it. */
export const shapeFood = (f: IFood & { donor: unknown }) => {
  const donor = f.donor as unknown as Donor | null;
  return {
    id: String(f._id),
    name: f.name,
    category: f.category,
    servings: f.servings,
    pickupLocation: f.pickupLocation,
    expiresAt: f.expiresAt,
    expired: f.expiresAt.getTime() <= Date.now(),
    notes: f.notes,
    image: f.image,
    status: f.status,
    isSeed: f.isSeed,
    source: f.source ?? null,
    donor: donor && typeof donor === "object" && "fullName" in donor ? { id: String(donor._id), name: donor.fullName, image: donor.profileImageUrl ?? null } : null,
    createdAt: f.createdAt,
  };
};

const imageUrl = z.url({ protocol: /^https?$/ }).max(800, "That link is too long");

const foodFields = {
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  category: z.enum(CATEGORIES),
  servings: z.coerce.number().int("Servings must be a whole number").min(1).max(500),
  pickupLocation: z.string().trim().min(3, "Say where it can be picked up").max(150),
  expiresAt: z.coerce.date(),
  notes: z.string().trim().max(500),
  image: imageUrl,
};

const futureEnough = (d: Date) => d.getTime() > Date.now() + 5 * 60_000;
const notTooFar = (d: Date) => d.getTime() < Date.now() + MAX_DAYS_AHEAD * 86_400_000;
const expiryRules = (d: Date, ctx: z.RefinementCtx) => {
  if (!futureEnough(d)) ctx.addIssue({ code: "custom", message: "The pickup deadline must be in the future" });
  else if (!notTooFar(d)) ctx.addIssue({ code: "custom", message: `The deadline can be at most ${MAX_DAYS_AHEAD} days away` });
};

const createSchema = z.object({
  body: z.object({ ...foodFields, expiresAt: foodFields.expiresAt.superRefine(expiryRules), notes: foodFields.notes.optional() }),
});
const updateSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: z.object({ ...foodFields, expiresAt: foodFields.expiresAt.superRefine(expiryRules) }).partial(),
});
const idSchema = z.object({ params: z.object({ id: objectIdSchema }) });

const listSchema = z.object({
  query: z.object({
    q: z.string().trim().max(80).optional(),
    category: z.enum(CATEGORIES).optional(),
    status: z.enum([...FOOD_STATUSES, "all"]).optional(),
    sort: z.enum(["expiry", "newest", "servings"]).optional(),
    page: z.coerce.number().int().min(1).max(10_000).optional(),
    limit: z.coerce.number().int().min(1).max(48).optional(),
  }),
});

const SORTS = { expiry: { expiresAt: 1 }, newest: { createdAt: -1 }, servings: { servings: -1, expiresAt: 1 } } as const;

/** Public: search, filter, sort and paginate. By default only food that can still be requested. */
router.get("/", validateRequest(listSchema), async (req: Request, res: Response) => {
  const { q, category, status = "available", sort = "expiry", page = 1, limit = 12 } = listSchema.parse({ query: req.query }).query;
  const filter: Record<string, unknown> = {};
  if (category) filter.category = category;
  if (status !== "all") filter.status = status;
  // Available food past its deadline is hidden, so nobody asks for something that is gone
  if (status === "available") filter.expiresAt = { $gt: new Date() };
  if (q) filter.name = new RegExp(escapeRegex(q), "i");

  const [rows, total] = await Promise.all([
    Food.find(filter).sort(SORTS[sort] as Record<string, 1 | -1>).skip((page - 1) * limit).limit(limit).populate(populateDonor),
    Food.countDocuments(filter),
  ]);
  res.set("Cache-Control", "public, max-age=15, stale-while-revalidate=60");
  res.json({ success: true, data: { foods: rows.map(shapeFood), total, page, pages: Math.max(1, Math.ceil(total / limit)) } });
});

/** The listings that will be gone soonest, for the home page. */
router.get("/soon", async (_req: Request, res: Response) => {
  const rows = await Food.find({ status: "available", expiresAt: { $gt: new Date() } }).sort({ expiresAt: 1 }).limit(6).populate(populateDonor);
  res.set("Cache-Control", "public, max-age=15, stale-while-revalidate=60");
  res.json({ success: true, data: rows.map(shapeFood) });
});

router.get("/categories", async (_req: Request, res: Response) => {
  const rows = await Food.aggregate([
    { $match: { status: "available", expiresAt: { $gt: new Date() } } },
    { $group: { _id: "$category", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  res.set("Cache-Control", "public, max-age=15, stale-while-revalidate=60");
  res.json({ success: true, data: rows.map((r) => ({ category: r._id, count: r.count })) });
});

/** The signed-in donor's own listings, with how many requests wait on each. */
router.get("/mine", authMiddleware, async (req: AuthRequest, res: Response) => {
  const rows = await Food.find({ donor: req.user!.id }).sort({ createdAt: -1 }).populate(populateDonor);
  const pending = await FoodRequest.aggregate([
    { $match: { food: { $in: rows.map((r) => r._id) }, status: "PENDING" } },
    { $group: { _id: "$food", count: { $sum: 1 } } },
  ]);
  const pendingOf = new Map(pending.map((p) => [String(p._id), p.count as number]));
  res.json({ success: true, data: rows.map((r) => ({ ...shapeFood(r), pendingRequests: pendingOf.get(String(r._id)) ?? 0 })) });
});

router.get("/:id", validateRequest(idSchema), async (req: Request, res: Response) => {
  const food = await Food.findById(req.params.id).populate(populateDonor);
  if (!food) throw new HttpException(404, "That listing was not found");
  res.json({ success: true, data: shapeFood(food) });
});

router.post("/", authMiddleware, validateRequest(createSchema), async (req: AuthRequest, res: Response) => {
  const donor = req.user!.id;
  const limit = req.user!.isDemo ? MAX_ACTIVE_DEMO : MAX_ACTIVE;
  if ((await Food.countDocuments({ donor, isSeed: false, status: { $ne: "donated" } })) >= limit) {
    throw new HttpException(400, `You can have up to ${limit} active listings. Remove one to add another.`);
  }
  const food = await Food.create({ ...req.body, donor });
  await food.populate(populateDonor);
  res.status(201).json({ success: true, data: shapeFood(food) });
});

/**
 * Only the donor, or an admin, may change a listing. Shared test accounts may not
 * touch the sample listings, nor anything that belongs to a real member.
 */
export const loadManageable = async (req: AuthRequest, id: string) => {
  const food = await Food.findById(id).populate(populateDonor);
  if (!food) throw new HttpException(404, "That listing was not found");

  const donor = food.donor as unknown as Donor | null;
  const isOwner = donor && String(donor._id) === req.user!.id;
  if (!isOwner && req.user!.role !== "ADMIN") throw new HttpException(403, "You can only change listings you shared");
  if (req.user!.isDemo && (food.isSeed || !donor?.isDemo)) {
    throw new HttpException(403, "Test accounts can only change listings they shared themselves.");
  }
  return food;
};

router.patch("/:id", authMiddleware, validateRequest(updateSchema), async (req: AuthRequest, res: Response) => {
  const food = await loadManageable(req, req.params.id as string);
  if (food.status === "donated") throw new HttpException(400, "This food has already been given away");
  food.set(req.body);
  await food.save();
  res.json({ success: true, data: shapeFood(food) });
});

router.delete("/:id", authMiddleware, validateRequest(idSchema), async (req: AuthRequest, res: Response) => {
  const food = await loadManageable(req, req.params.id as string);
  await Promise.all([FoodRequest.deleteMany({ food: food._id }), food.deleteOne()]);
  res.json({ success: true, message: "Listing removed" });
});

/** The donor hands the food over: the reserved request is completed. */
router.post("/:id/donated", authMiddleware, validateRequest(idSchema), async (req: AuthRequest, res: Response) => {
  const food = await loadManageable(req, req.params.id as string);
  if (food.status !== "requested") throw new HttpException(400, "Accept a request first, then mark the food as handed over");
  food.status = "donated";
  await food.save();
  await FoodRequest.updateOne({ food: food._id, status: "ACCEPTED" }, { $set: { status: "COMPLETED" } });
  res.json({ success: true, data: shapeFood(food) });
});

/** The pickup fell through: the food goes back on the list. */
router.post("/:id/reopen", authMiddleware, validateRequest(idSchema), async (req: AuthRequest, res: Response) => {
  const food = await loadManageable(req, req.params.id as string);
  if (food.status !== "requested") throw new HttpException(400, "Only reserved food can be put back on the list");
  food.status = "available";
  await food.save();
  await FoodRequest.updateOne({ food: food._id, status: "ACCEPTED" }, { $set: { status: "CANCELLED" } });
  res.json({ success: true, data: shapeFood(food) });
});

export default router;
