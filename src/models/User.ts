import { Schema, model, Document } from "mongoose";

export type UserRole = "USER" | "ADMIN";

export interface IUser extends Document {
  email: string;
  password?: string;
  googleId?: string;
  emailVerified: boolean;
  fullName: string;
  profileImageUrl?: string;
  role: UserRole;
  isBlocked: boolean;
  /** Shared test account shown on the login page; sign-in details are locked */
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, unique: true, required: true, trim: true, lowercase: true },
    // Optional: accounts created through Google sign-in have no password
    password: { type: String, select: false },
    googleId: { type: String, index: true, sparse: true },
    emailVerified: { type: Boolean, default: false },
    fullName: { type: String, required: true, trim: true },
    profileImageUrl: String,
    role: { type: String, enum: ["USER", "ADMIN"], default: "USER" },
    isBlocked: { type: Boolean, default: false },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

export const User = model<IUser>("User", userSchema);
