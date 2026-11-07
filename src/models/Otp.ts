import { Schema, model, Document } from "mongoose";

export type OtpPurpose = "VERIFY_EMAIL" | "RESET_PASSWORD" | "CHANGE_EMAIL";

export interface IOtp extends Document {
  /** Lookup key: the address, or userId:address for email changes */
  email: string;
  purpose: OtpPurpose;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  lastSentAt: Date;
}

const otpSchema = new Schema<IOtp>({
  email: { type: String, required: true, lowercase: true, trim: true },
  purpose: { type: String, enum: ["VERIFY_EMAIL", "RESET_PASSWORD", "CHANGE_EMAIL"], required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  lastSentAt: { type: Date, default: Date.now },
});

otpSchema.index({ email: 1, purpose: 1 }, { unique: true });
// MongoDB removes expired codes automatically
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Otp = model<IOtp>("Otp", otpSchema);
