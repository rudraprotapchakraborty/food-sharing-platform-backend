import { Router } from "express";
import { Food } from "../../models/Food";
import { User } from "../../models/User";

const router = Router();

/** Aggregate counts only (no personal data) for the landing page. */
router.get("/stats", async (_req, res) => {
  const [shared, available, donated, members] = await Promise.all([
    Food.estimatedDocumentCount(),
    Food.countDocuments({ status: "available", expiresAt: { $gt: new Date() } }),
    Food.countDocuments({ status: "donated" }),
    User.countDocuments({ emailVerified: true, isBlocked: false }),
  ]);
  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.json({ success: true, data: { shared, available, donated, members } });
});

export default router;
