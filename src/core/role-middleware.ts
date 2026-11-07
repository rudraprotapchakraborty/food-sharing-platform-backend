import { NextFunction, Response } from "express";
import { AuthRequest } from "./auth-middleware";
import { HttpException } from "./http-exception";

export const requireRole = (...roles: ("USER" | "ADMIN")[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new HttpException(403, "Forbidden");
    }
    next();
  };
};
