import { Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { User, IUser } from "../../models/User";
import { hashPassword, comparePassword } from "../../utils/password";
import { signAccessToken } from "../../utils/jwt";
import { HttpException } from "../../core/http-exception";
import { consumeOtp, issueOtp } from "../../utils/otp";
import { env } from "../../config/env";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../../config/demo";

const googleClient = env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(env.GOOGLE_CLIENT_ID)
  : null;

export const publicUser = (user: IUser) => ({
  id: user._id,
  email: user.email,
  fullName: user.fullName,
  role: user.role,
  profileImageUrl: user.profileImageUrl,
  isBlocked: user.isBlocked,
  emailVerified: user.emailVerified,
  isDemo: Boolean(user.isDemo),
});

const session = (user: IUser) => ({
  user: publicUser(user),
  accessToken: signAccessToken({ userId: user._id.toString(), role: user.role }),
});

// Compared against when the email is unknown so response time does not reveal
// whether an account exists.
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO5Qb1y0m8vQx0Kq3lq6W5eYvQ2s4n1jW";

export class AuthController {
  /** Test accounts for the login page. Empty until the demo data is seeded. */
  static async demoAccounts(_req: Request, res: Response) {
    const found = await User.find({
      email: { $in: DEMO_ACCOUNTS.map((a) => a.email) },
      isDemo: true,
    }).select("email");
    const present = new Set(found.map((u) => u.email));
    res.json({
      success: true,
      data: DEMO_ACCOUNTS.filter((a) => present.has(a.email)).map((a) => ({
        ...a,
        password: DEMO_PASSWORD,
      })),
    });
  }

  /** Creates the account (unverified) and emails a 6 digit code. */
  static async register(req: Request, res: Response) {
    const { email, password, fullName } = req.body;

    const existing = await User.findOne({ email });
    if (existing?.emailVerified) {
      throw new HttpException(409, "Email already registered");
    }

    if (existing) {
      // Unverified earlier attempt: let the owner of the address retry
      existing.password = await hashPassword(password);
      existing.fullName = fullName;
      await existing.save();
    } else {
      await User.create({
        email,
        password: await hashPassword(password),
        fullName,
        emailVerified: false,
      });
    }

    await issueOtp(email, "VERIFY_EMAIL");
    res.status(201).json({
      success: true,
      data: { requiresVerification: true, email },
    });
  }

  static async verifyEmail(req: Request, res: Response) {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });
    if (!user) throw new HttpException(400, "Invalid code");

    await consumeOtp(email, "VERIFY_EMAIL", otp);
    user.emailVerified = true;
    await user.save();

    res.json({ success: true, data: session(user) });
  }

  static async resendOtp(req: Request, res: Response) {
    const { email } = req.body;
    const user = await User.findOne({ email });
    // Same response whether or not the account exists
    if (user && !user.emailVerified) await issueOtp(email, "VERIFY_EMAIL");
    res.json({ success: true, message: "If the account needs it, a new code was sent" });
  }

  static async login(req: Request, res: Response) {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");
    const match = await comparePassword(password, user?.password ?? DUMMY_HASH);
    if (!user || !user.password || !match) {
      throw new HttpException(401, "Invalid credentials");
    }

    if (user.isBlocked) {
      throw new HttpException(403, "Your account is blocked. Please contact support.");
    }

    if (!user.emailVerified) {
      await issueOtp(email, "VERIFY_EMAIL").catch(() => undefined);
      throw new HttpException(403, "Email not verified. We sent you a new code.", {
        code: "EMAIL_NOT_VERIFIED",
        email,
      });
    }

    res.json({ success: true, data: session(user) });
  }

  /** Accepts a Google ID token (from Google Identity Services). */
  static async google(req: Request, res: Response) {
    if (!googleClient) {
      throw new HttpException(503, "Google login is not configured");
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: req.body.idToken,
        audience: env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      throw new HttpException(401, "Invalid Google token");
    }
    if (!payload?.email || !payload.email_verified) {
      throw new HttpException(401, "Google account email is not verified");
    }

    const email = payload.email.toLowerCase();
    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        email,
        fullName: payload.name || email.split("@")[0],
        profileImageUrl: payload.picture,
        googleId: payload.sub,
        emailVerified: true,
      });
    } else {
      if (user.isBlocked) {
        throw new HttpException(403, "Your account is blocked. Please contact support.");
      }
      if (user.googleId && user.googleId !== payload.sub) {
        throw new HttpException(409, "This email is linked to a different Google account");
      }
      user.googleId = payload.sub;
      user.emailVerified = true;
      if (!user.profileImageUrl && payload.picture) user.profileImageUrl = payload.picture;
      await user.save();
    }

    res.json({ success: true, data: session(user) });
  }

  static async forgotPassword(req: Request, res: Response) {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (user) await issueOtp(email, "RESET_PASSWORD").catch(() => undefined);
    res.json({ success: true, message: "If the account exists, a code was sent" });
  }

  static async resetPassword(req: Request, res: Response) {
    const { email, otp, newPassword } = req.body;
    const user = await User.findOne({ email });
    if (!user) throw new HttpException(400, "Invalid code");

    await consumeOtp(email, "RESET_PASSWORD", otp);
    user.password = await hashPassword(newPassword);
    user.emailVerified = true; // they proved ownership of the inbox
    await user.save();

    res.json({ success: true, message: "Password updated" });
  }
}
