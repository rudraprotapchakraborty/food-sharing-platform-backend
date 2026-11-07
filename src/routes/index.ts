import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes";
import userRoutes from "../modules/users/user.routes";
import foodRoutes from "../modules/foods/food.routes";
import requestRoutes from "../modules/requests/request.routes";
import adminRoutes from "../modules/admin/admin.routes";
import uploadRoutes from "../modules/uploads/upload.routes";
import publicRoutes from "../modules/public/public.routes";
import { apiLimiter } from "../core/rate-limit";

const router = Router();

router.use(apiLimiter);

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/foods", foodRoutes);
router.use("/requests", requestRoutes);
router.use("/admin", adminRoutes);
router.use("/uploads", uploadRoutes);
router.use("/public", publicRoutes);

export default router;
