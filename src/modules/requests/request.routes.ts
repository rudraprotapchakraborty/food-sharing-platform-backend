import { Router, Response } from "express";
import { z } from "zod";
import { AuthRequest, authMiddleware } from "../../core/auth-middleware";
import { HttpException } from "../../core/http-exception";
import { objectIdSchema } from "../../core/object-id";
import { validateRequest } from "../../core/validate-request";
import { Food, IFood } from "../../models/Food";
import { FoodRequest, IFoodRequest } from "../../models/FoodRequest";
import { IUser } from "../../models/User";

const router = Router();
router.use(authMiddleware);

type Person = Pick<IUser, "fullName" | "profileImageUrl" | "email" | "isDemo"> & { _id: unknown };

const people = "fullName profileImageUrl email isDemo";
const populateAll = [
  { path: "food", select: "name image status pickupLocation expiresAt servings" },
  { path: "requester", select: people },
  { path: "donor", select: people },
];

/**
 * A request as the two people involved may see it. Email addresses stay hidden
 * until the donor accepts, and then only the two of them can see each other's.
 */
const shape = (r: IFoodRequest) => {
  const food = r.food as unknown as (IFood & { _id: unknown }) | null;
  const requester = r.requester as unknown as Person | null;
  const donor = r.donor as unknown as Person | null;
  const revealed = r.status === "ACCEPTED" || r.status === "COMPLETED";
  const person = (p: Person | null) =>
    p ? { id: String(p._id), name: p.fullName, image: p.profileImageUrl ?? null, email: revealed ? p.email : null } : null;
  return {
    id: String(r._id),
    status: r.status,
    message: r.message,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    food: food
      ? { id: String(food._id), name: food.name, image: food.image, status: food.status, pickupLocation: food.pickupLocation, expiresAt: food.expiresAt, servings: food.servings }
      : null,
    requester: person(requester),
    donor: person(donor),
  };
};

const createSchema = z.object({
  body: z.object({ foodId: objectIdSchema, message: z.string().trim().max(300).optional() }),
});
const idSchema = z.object({ params: z.object({ id: objectIdSchema }) });
const foodIdSchema = z.object({ params: z.object({ foodId: objectIdSchema }) });

const load = async (id: string) => {
  const request = await FoodRequest.findById(id).populate(populateAll);
  if (!request) throw new HttpException(404, "Request not found");
  return request;
};
const idOf = (ref: unknown) => String((ref as { _id?: unknown })?._id ?? ref);

/** Asks the donor for a listing. */
router.post("/", validateRequest(createSchema), async (req: AuthRequest, res: Response) => {
  const food = await Food.findById(req.body.foodId).populate({ path: "donor", select: "isDemo" });
  if (!food) throw new HttpException(404, "That listing was not found");
  const donorId = idOf(food.donor);

  if (donorId === req.user!.id) throw new HttpException(400, "That is your own listing");
  if (food.status !== "available") throw new HttpException(400, "This food is no longer available");
  if (food.expiresAt.getTime() <= Date.now()) throw new HttpException(400, "The pickup deadline for this food has passed");
  // Shared test accounts never send requests to real members
  if (req.user!.isDemo && !(food.donor as unknown as { isDemo?: boolean })?.isDemo) {
    throw new HttpException(403, "Test accounts can only request food shared by other test accounts.");
  }

  try {
    const created = await FoodRequest.create({ food: food._id, requester: req.user!.id, donor: donorId, message: req.body.message ?? "" });
    const full = await load(String(created._id));
    res.status(201).json({ success: true, data: shape(full) });
  } catch (err: any) {
    if (err?.code === 11000) throw new HttpException(409, "You already have a request for this food");
    throw err;
  }
});

/** Requests I have sent. */
router.get("/mine", async (req: AuthRequest, res: Response) => {
  const rows = await FoodRequest.find({ requester: req.user!.id }).sort({ createdAt: -1 }).populate(populateAll);
  res.json({ success: true, data: rows.map(shape) });
});

/** Requests other people sent for my food. */
router.get("/incoming", async (req: AuthRequest, res: Response) => {
  const rows = await FoodRequest.find({ donor: req.user!.id }).sort({ status: 1, createdAt: -1 }).populate(populateAll);
  res.json({ success: true, data: rows.map(shape) });
});

/** My own request for one listing, if any (so the page can show its state). */
router.get("/for-food/:foodId", validateRequest(foodIdSchema), async (req: AuthRequest, res: Response) => {
  const row = await FoodRequest.findOne({ food: req.params.foodId, requester: req.user!.id }).sort({ createdAt: -1 }).populate(populateAll);
  res.json({ success: true, data: row ? shape(row) : null });
});

/** The donor says yes. The food is reserved and every other waiting request is declined. */
router.post("/:id/accept", validateRequest(idSchema), async (req: AuthRequest, res: Response) => {
  const request = await load(req.params.id as string);
  if (idOf(request.donor) !== req.user!.id) throw new HttpException(403, "Only the donor can accept a request");
  if (request.status !== "PENDING") throw new HttpException(400, "This request has already been answered");

  const foodId = idOf(request.food);
  // Atomic: if two accepts race, only one finds the food still available
  const reserved = await Food.updateOne({ _id: foodId, status: "available", expiresAt: { $gt: new Date() } }, { $set: { status: "requested" } });
  if (!reserved.modifiedCount) throw new HttpException(400, "This food is no longer available");

  await FoodRequest.updateOne({ _id: request._id }, { $set: { status: "ACCEPTED" } });
  await FoodRequest.updateMany({ food: foodId, _id: { $ne: request._id }, status: "PENDING" }, { $set: { status: "DECLINED" } });
  res.json({ success: true, data: shape(await load(String(request._id))) });
});

router.post("/:id/decline", validateRequest(idSchema), async (req: AuthRequest, res: Response) => {
  const request = await load(req.params.id as string);
  if (idOf(request.donor) !== req.user!.id) throw new HttpException(403, "Only the donor can decline a request");
  if (request.status !== "PENDING") throw new HttpException(400, "This request has already been answered");
  request.status = "DECLINED";
  await request.save();
  res.json({ success: true, data: shape(request) });
});

/** The requester changes their mind. A reserved food goes back on the list. */
router.post("/:id/cancel", validateRequest(idSchema), async (req: AuthRequest, res: Response) => {
  const request = await load(req.params.id as string);
  if (idOf(request.requester) !== req.user!.id) throw new HttpException(403, "Only the person who asked can cancel");
  if (request.status !== "PENDING" && request.status !== "ACCEPTED") throw new HttpException(400, "This request can no longer be cancelled");
  const wasAccepted = request.status === "ACCEPTED";
  request.status = "CANCELLED";
  await request.save();
  if (wasAccepted) await Food.updateOne({ _id: idOf(request.food), status: "requested" }, { $set: { status: "available" } });
  res.json({ success: true, data: shape(request) });
});

export default router;
