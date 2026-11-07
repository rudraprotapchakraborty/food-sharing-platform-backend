import { Router } from "express";
import { Response } from "express";
import { AccountController } from "./user.account";
import { AuthRequest, authMiddleware } from "../../core/auth-middleware";
import { HttpException } from "../../core/http-exception";
import { validateRequest } from "../../core/validate-request";
import { authLimiter } from "../../core/rate-limit";
import { User } from "../../models/User";
import { assertNotDemo } from "../../config/demo";
import {
  changePasswordSchema,
  confirmEmailChangeSchema,
  deleteAccountSchema,
  requestEmailChangeSchema,
  updateProfileSchema,
} from "./user.types";

const router = Router();
router.use(authMiddleware);

const shape = (u: InstanceType<typeof User>) => ({
  id: u._id,
  email: u.email,
  fullName: u.fullName,
  role: u.role,
  profileImageUrl: u.profileImageUrl,
  emailVerified: u.emailVerified,
  isBlocked: u.isBlocked,
  isDemo: Boolean(u.isDemo),
});

router.get("/me/self", async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw new HttpException(404, "User not found");
  res.json({ success: true, data: shape(user) });
});

router.patch("/me/self", validateRequest(updateProfileSchema), async (req: AuthRequest, res: Response) => {
  assertNotDemo(req.user, "change the profile");
  const { fullName, profileImageUrl } = req.body as { fullName?: string; profileImageUrl?: string };
  const set: Record<string, string> = {};
  const unset: Record<string, 1> = {};
  if (fullName !== undefined) set.fullName = fullName;
  // An empty string removes the photo
  if (profileImageUrl === "") unset.profileImageUrl = 1;
  else if (profileImageUrl !== undefined) set.profileImageUrl = profileImageUrl;

  const user = await User.findByIdAndUpdate(
    req.user!.id,
    { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    { returnDocument: "after" }
  );
  if (!user) throw new HttpException(404, "User not found");
  res.json({ success: true, data: shape(user) });
});

router.get("/me/methods", AccountController.methods);
router.post("/me/password", authLimiter, validateRequest(changePasswordSchema), AccountController.changePassword);
router.post("/me/email", authLimiter, validateRequest(requestEmailChangeSchema), AccountController.requestEmailChange);
router.put("/me/email", authLimiter, validateRequest(confirmEmailChangeSchema), AccountController.confirmEmailChange);
router.delete("/me", validateRequest(deleteAccountSchema), AccountController.deleteAccount);

export default router;
