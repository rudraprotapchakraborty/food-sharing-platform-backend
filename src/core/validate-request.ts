import { ZodError, ZodType, z } from "zod";
import { NextFunction, Request, Response } from "express";
import { HttpException } from "./http-exception";

/**
 * Validates body / query / params against the schema. The parsed (and
 * therefore stripped) body replaces req.body so unknown fields can never reach
 * controllers or the database.
 */
export const validateRequest =
  (schema: ZodType<{ body?: unknown; query?: unknown; params?: unknown }>) =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse({
        body: req.body ?? {},
        query: req.query,
        params: req.params,
      });
      if (parsed.body !== undefined) req.body = parsed.body;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        throw new HttpException(400, "Validation failed", z.flattenError(error));
      }
      next(error);
    }
  };
