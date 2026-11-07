import { NextFunction, Request, Response } from "express";
import { Error as MongooseError } from "mongoose";
import { HttpException } from "./http-exception";
import { env } from "../config/env";

export const notFoundMiddleware = (_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: "Route not found" });
};

export const errorMiddleware = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof HttpException) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      details: err.details,
    });
  }

  if (err instanceof MongooseError.CastError) {
    return res.status(400).json({ success: false, message: "Invalid id" });
  }

  if (err instanceof MongooseError.ValidationError) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details: Object.fromEntries(
        Object.entries(err.errors).map(([k, v]) => [k, v.message])
      ),
    });
  }

  if (err?.code === 11000) {
    console.error("Duplicate key:", err.message);
    const field = Object.keys(err.keyPattern ?? {})[0];
    return res.status(409).json({
      success: false,
      message: field ? `That ${field} is already in use` : "Duplicate value already exists",
    });
  }

  // Malformed JSON bodies etc. raised by body-parser
  if (typeof err?.status === "number" && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ success: false, message: err.message });
  }

  console.error(err);
  return res.status(500).json({
    success: false,
    message: "Internal server error",
    ...(env.isProduction ? {} : { error: String(err?.message ?? err) }),
  });
};
