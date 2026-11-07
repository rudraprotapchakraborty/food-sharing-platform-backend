import { NextFunction, Response, Request } from "express";
import { verifyAccessToken } from "../utils/jwt";
import { HttpException } from "./http-exception";
import { User } from "../models/User";

export interface AuthRequest extends Request {
  user?: { id: string; role: "USER" | "ADMIN"; isDemo: boolean };
}

/**
 * Verifies the bearer token and loads the current role / blocked state from
 * the database, so role changes and blocks take effect immediately instead of
 * waiting for the token to expire.
 */
export const authMiddleware = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new HttpException(401, "Not authenticated");
  }

  let payload;
  try {
    payload = verifyAccessToken(header.slice(7));
  } catch {
    throw new HttpException(401, "Invalid or expired token");
  }

  const user = await User.findById(payload.userId).select("role isBlocked isDemo");
  if (!user) throw new HttpException(401, "Account no longer exists");
  if (user.isBlocked) {
    throw new HttpException(403, "Your account is blocked. Please contact support.");
  }

  req.user = {
    id: user._id.toString(),
    role: user.role,
    isDemo: Boolean(user.isDemo),
  };
  next();
};
