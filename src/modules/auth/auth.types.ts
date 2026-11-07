import { z } from "zod";

const email = z
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase());
const otp = z.string().regex(/^\d{6}$/, "Code must be 6 digits");
const password = z.string().min(8).max(128);

export const registerSchema = z.object({
  body: z.object({
    email,
    password,
    fullName: z.string().trim().min(2).max(80),
  }),
});

export const loginSchema = z.object({
  body: z.object({ email, password: z.string().min(1).max(128) }),
});

export const verifyEmailSchema = z.object({ body: z.object({ email, otp }) });

export const emailOnlySchema = z.object({ body: z.object({ email }) });

export const resetPasswordSchema = z.object({
  body: z.object({ email, otp, newPassword: password }),
});

export const googleLoginSchema = z.object({
  body: z.object({ idToken: z.string().min(20).max(4096) }),
});
