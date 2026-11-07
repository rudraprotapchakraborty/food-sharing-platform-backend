import { Response } from "express";
import { AuthRequest } from "../../core/auth-middleware";
import { HttpException } from "../../core/http-exception";
import { User } from "../../models/User";
import { consumeOtp, issueOtp } from "../../utils/otp";
import { comparePassword, hashPassword } from "../../utils/password";
import { deleteUserAndContent } from "./user.cleanup";
import { assertNotDemo } from "../../config/demo";

const loadWithPassword = async (id: string) => {
  const user = await User.findById(id).select("+password");
  if (!user) throw new HttpException(404, "Account not found");
  return user;
};

/** Self-service account settings: password, email, deletion. */
export class AccountController {
  /** Which sign-in methods the account has (drives the settings UI). */
  static async methods(req: AuthRequest, res: Response) {
    const user = await loadWithPassword(req.user!.id);
    res.json({
      success: true,
      data: {
        hasPassword: Boolean(user.password),
        google: Boolean(user.googleId),
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      },
    });
  }

  /** Changes the password, or sets one for a Google-only account. */
  static async changePassword(req: AuthRequest, res: Response) {
    assertNotDemo(req.user, "change the password");
    const { currentPassword, newPassword } = req.body;
    const user = await loadWithPassword(req.user!.id);

    if (user.password) {
      if (
        !currentPassword ||
        !(await comparePassword(currentPassword, user.password))
      ) {
        throw new HttpException(403, "Current password is incorrect");
      }
    }
    user.password = await hashPassword(newPassword);
    await user.save();
    res.json({ success: true, message: "Password updated" });
  }

  /** Step 1: send a code to the new address (needs the current password). */
  static async requestEmailChange(req: AuthRequest, res: Response) {
    assertNotDemo(req.user, "change the email");
    const { email, currentPassword } = req.body;
    const user = await loadWithPassword(req.user!.id);

    // Changing the email unlinks Google, so a password is required first.
    if (!user.password) {
      throw new HttpException(
        400,
        "Set a password first, then you can change your email"
      );
    }
    if (!(await comparePassword(currentPassword, user.password))) {
      throw new HttpException(403, "Current password is incorrect");
    }
    if (email === user.email) {
      throw new HttpException(400, "That is already your email");
    }
    if (await User.exists({ email })) {
      throw new HttpException(409, "That email is already in use");
    }

    await issueOtp(email, "CHANGE_EMAIL", `${user._id}:${email}`);
    res.json({ success: true, message: "Code sent" });
  }

  /** Step 2: confirm the code and switch the address. */
  static async confirmEmailChange(req: AuthRequest, res: Response) {
    assertNotDemo(req.user, "change the email");
    const { email, code } = req.body;
    const user = await loadWithPassword(req.user!.id);

    await consumeOtp(email, "CHANGE_EMAIL", code, `${user._id}:${email}`);
    if (await User.exists({ email, _id: { $ne: user._id } })) {
      throw new HttpException(409, "That email is already in use");
    }
    user.email = email;
    user.emailVerified = true;
    user.googleId = undefined; // the Google account belonged to the old address
    await user.save();

    res.json({
      success: true,
      data: { id: user._id, email: user.email, fullName: user.fullName },
    });
  }

  /** Deletes the account and its content. Confirmed by typing the email. */
  static async deleteAccount(req: AuthRequest, res: Response) {
    assertNotDemo(req.user, "be deleted");
    const user = await loadWithPassword(req.user!.id);

    if ((req.body.confirmEmail as string).trim().toLowerCase() !== user.email) {
      throw new HttpException(403, "Type your email address exactly to confirm");
    }
    if (
      user.role === "ADMIN" &&
      (await User.countDocuments({ role: "ADMIN" })) <= 1
    ) {
      throw new HttpException(
        400,
        "You are the only admin. Make someone else an admin first."
      );
    }

    await deleteUserAndContent(user);

    res.json({ success: true, message: "Account deleted" });
  }
}
