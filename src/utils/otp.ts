import crypto from "crypto";
import { Otp, OtpPurpose } from "../models/Otp";
import { HttpException } from "../core/http-exception";
import { env } from "../config/env";
import { sendOtpMail } from "./mailer";

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const hashCode = (email: string, purpose: string, code: string) =>
  crypto
    .createHmac("sha256", env.JWT_ACCESS_SECRET)
    .update(`${email}:${purpose}:${code}`)
    .digest("hex");

export const issueOtp = async (
  email: string,
  purpose: OtpPurpose,
  key: string = email
) => {
  const existing = await Otp.findOne({ email: key, purpose });
  if (existing && Date.now() - existing.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil(
      (RESEND_COOLDOWN_MS - (Date.now() - existing.lastSentAt.getTime())) / 1000
    );
    throw new HttpException(429, `Please wait ${wait}s before requesting another code`);
  }

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  await Otp.findOneAndUpdate(
    { email: key, purpose },
    {
      codeHash: hashCode(key, purpose, code),
      attempts: 0,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      lastSentAt: new Date(),
    },
    { upsert: true, returnDocument: "after" }
  );
  await sendOtpMail(email, code, purpose);
};

/** Throws unless the code is valid. A successful check consumes the code. */
export const consumeOtp = async (
  email: string,
  purpose: OtpPurpose,
  code: string,
  key: string = email
) => {
  const record = await Otp.findOne({ email: key, purpose });
  if (!record || record.expiresAt.getTime() < Date.now()) {
    throw new HttpException(400, "Code expired or not requested");
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    await record.deleteOne();
    throw new HttpException(429, "Too many wrong attempts. Request a new code.");
  }

  const expected = Buffer.from(record.codeHash, "hex");
  const actual = Buffer.from(hashCode(key, purpose, code), "hex");
  if (!crypto.timingSafeEqual(expected, actual)) {
    record.attempts += 1;
    await record.save();
    throw new HttpException(400, "Invalid code");
  }
  await record.deleteOne();
};
