import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { AuthRequest, authMiddleware } from "../../core/auth-middleware";
import { validateRequest } from "../../core/validate-request";
import { HttpException } from "../../core/http-exception";
import { env } from "../../config/env";
import { assertNotDemo } from "../../config/demo";

const router = Router();

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many uploads, try again later" },
});

const imageSchema = z.object({
  body: z.object({
    image: z
      .string()
      .max(900_000)
      .regex(
        /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/,
        "Unsupported image"
      ),
  }),
});

/**
 * POST /api/uploads/image  { image: "data:image/jpeg;base64,..." }
 * Hosts the picture on ImgBB (the key stays on the server) and returns its URL.
 */
router.post(
  "/image",
  authMiddleware,
  uploadLimiter,
  validateRequest(imageSchema),
  async (req: AuthRequest, res) => {
    assertNotDemo(req.user, "change the profile photo");
    if (!env.IMGBB_API_KEY) {
      throw new HttpException(503, "Image hosting is not configured");
    }

    const base64 = (req.body.image as string).split(",")[1];
    const form = new FormData();
    form.set("image", base64);

    const response = await fetch(
      `https://api.imgbb.com/1/upload?key=${encodeURIComponent(env.IMGBB_API_KEY)}`,
      { method: "POST", body: form, signal: AbortSignal.timeout(20_000) }
    );
    const json: any = await response.json().catch(() => null);
    const url: string | undefined = json?.data?.display_url || json?.data?.url;
    if (!response.ok || !url) {
      throw new HttpException(502, "Image hosting failed. Please try again.");
    }
    res.status(201).json({ success: true, data: { url } });
  }
);

export default router;
