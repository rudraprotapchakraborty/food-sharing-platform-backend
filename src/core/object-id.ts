import { z } from "zod";
import { HttpException } from "./http-exception";

const OBJECT_ID = /^[a-f0-9]{24}$/i;

export const objectIdSchema = z.string().regex(OBJECT_ID, "Invalid id");

export const assertObjectId = (value: unknown, label = "id"): string => {
  if (typeof value !== "string" || !OBJECT_ID.test(value)) {
    throw new HttpException(400, `Invalid ${label}`);
  }
  return value;
};

export const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
