import { z } from "zod";
import { objectIdSchema } from "../../core/object-id";

export const updateProfileSchema = z.object({
  body: z
    .object({
      fullName: z.string().trim().min(2).max(80),
      // empty string removes the photo
      profileImageUrl: z.union([z.url().max(500), z.literal("")]),
    })
    .partial(),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().max(128).optional(),
    newPassword: z.string().min(8).max(128),
  }),
});

const emailField = z
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase());

export const requestEmailChangeSchema = z.object({
  body: z.object({
    email: emailField,
    currentPassword: z.string().min(1).max(128),
  }),
});

export const confirmEmailChangeSchema = z.object({
  body: z.object({ email: emailField, code: z.string().regex(/^\d{6}$/) }),
});

export const deleteAccountSchema = z.object({
  body: z.object({ confirmEmail: z.string().max(254) }),
});

export const adminUpdateUserSchema = z.object({
  params: z.object({ userId: objectIdSchema }),
  body: z
    .object({
      role: z.enum(["USER", "ADMIN"]),
      isBlocked: z.boolean(),
    })
    .partial(),
});

export const userIdParamSchema = z.object({
  params: z.object({ userId: objectIdSchema }),
});
