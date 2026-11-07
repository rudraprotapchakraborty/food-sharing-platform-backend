import { Router } from "express";
import { AuthController } from "./auth.controller";
import { validateRequest } from "../../core/validate-request";
import { authLimiter } from "../../core/rate-limit";
import {
  emailOnlySchema,
  googleLoginSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "./auth.types";

const router = Router();
router.use(authLimiter);

router.get("/demo-accounts", AuthController.demoAccounts);
router.post("/register", validateRequest(registerSchema), AuthController.register);
router.post("/login", validateRequest(loginSchema), AuthController.login);
router.post("/google", validateRequest(googleLoginSchema), AuthController.google);
router.post("/verify-email", validateRequest(verifyEmailSchema), AuthController.verifyEmail);
router.post("/resend-otp", validateRequest(emailOnlySchema), AuthController.resendOtp);
router.post("/forgot-password", validateRequest(emailOnlySchema), AuthController.forgotPassword);
router.post("/reset-password", validateRequest(resetPasswordSchema), AuthController.resetPassword);

export default router;
