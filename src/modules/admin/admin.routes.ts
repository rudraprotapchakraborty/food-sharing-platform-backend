import { Router, Response } from "express";
import { AuthRequest, authMiddleware } from "../../core/auth-middleware";
import { requireRole } from "../../core/role-middleware";
import { HttpException } from "../../core/http-exception";
import { validateRequest } from "../../core/validate-request";
import { escapeRegex } from "../../core/object-id";
import { DEMO_ACCOUNTS } from "../../config/demo";
import { User } from "../../models/User";
import { Food } from "../../models/Food";
import { FoodRequest } from "../../models/FoodRequest";
import { deleteUserAndContent } from "../users/user.cleanup";
import { adminUpdateUserSchema, userIdParamSchema } from "../users/user.types";

const router = Router();
router.use(authMiddleware, requireRole("ADMIN"));

const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

/** A demo admin only ever sees and manages demo accounts, never real members. */
const scope = (req: AuthRequest) => (req.user!.isDemo ? { isDemo: true } : {});

/** The shared login accounts shown on the sign-in page must keep working for everyone. */
const isLockedLogin = (email: string) => DEMO_ACCOUNTS.some((a) => a.email === email);

const loadInScope = async (req: AuthRequest, userId: string) => {
  const target = await User.findOne({ _id: userId, ...scope(req) });
  if (!target) throw new HttpException(404, "User not found");
  return target;
};

router.get("/stats", async (req: AuthRequest, res: Response) => {
  const demoOnly = req.user!.isDemo;
  const ids = demoOnly ? await User.distinct("_id", { isDemo: true }) : null;
  const foodScope = ids ? { donor: { $in: ids } } : {};
  const [users, verified, blocked, foods, available, donated, requests] = await Promise.all([
    User.countDocuments(scope(req)),
    User.countDocuments({ ...scope(req), emailVerified: true }),
    User.countDocuments({ ...scope(req), isBlocked: true }),
    Food.countDocuments(foodScope),
    Food.countDocuments({ ...foodScope, status: "available", expiresAt: { $gt: new Date() } }),
    Food.countDocuments({ ...foodScope, status: "donated" }),
    FoodRequest.countDocuments(ids ? { donor: { $in: ids } } : {}),
  ]);
  res.json({ success: true, data: { users, verified, blocked, foods, available, donated, requests } });
});

router.get("/users", async (req: AuthRequest, res: Response) => {
  const page = clampInt(req.query.page, 1, 1, 10_000);
  const limit = clampInt(req.query.limit, 20, 1, 100);
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
  const filter = {
    ...scope(req),
    ...(q ? { $or: [{ email: new RegExp(escapeRegex(q), "i") }, { fullName: new RegExp(escapeRegex(q), "i") }] } : {}),
  };

  const [rows, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);
  const counts = await Food.aggregate([
    { $match: { donor: { $in: rows.map((u) => u._id) }, isSeed: false } },
    { $group: { _id: "$donor", count: { $sum: 1 } } },
  ]);
  const countOf = new Map(counts.map((c) => [String(c._id), c.count as number]));

  res.json({
    success: true,
    data: {
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      users: rows.map((u) => ({
        id: String(u._id),
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        profileImageUrl: u.profileImageUrl,
        emailVerified: u.emailVerified,
        isBlocked: u.isBlocked,
        isDemo: u.isDemo,
        locked: isLockedLogin(u.email),
        foodCount: countOf.get(String(u._id)) ?? 0,
        createdAt: u.createdAt,
      })),
    },
  });
});

router.patch("/users/:userId", validateRequest(adminUpdateUserSchema), async (req: AuthRequest, res: Response) => {
  const userId = req.params.userId as string;
  const target = await loadInScope(req, userId);
  if (userId === req.user!.id && (req.body.isBlocked === true || (req.body.role && req.body.role !== "ADMIN"))) {
    throw new HttpException(400, "You cannot block or demote yourself");
  }
  if (isLockedLogin(target.email)) {
    throw new HttpException(403, "The shared login accounts cannot be blocked or changed.");
  }
  const updated = await User.findByIdAndUpdate(userId, { $set: req.body }, { returnDocument: "after" });
  res.json({ success: true, data: { id: userId, role: updated?.role, isBlocked: updated?.isBlocked } });
});

router.delete("/users/:userId", validateRequest(userIdParamSchema), async (req: AuthRequest, res: Response) => {
  const userId = req.params.userId as string;
  if (userId === req.user!.id) throw new HttpException(400, "You cannot delete your own account here");
  const target = await loadInScope(req, userId);
  if (target.isDemo) throw new HttpException(403, "Shared test accounts are managed by the seed script");
  await deleteUserAndContent(target);
  res.json({ success: true, message: "User deleted" });
});

export default router;
