import nodemailer from "nodemailer";
import { Resend } from "resend";
import { env } from "../config/env";

const smtp =
  env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      })
    : null;

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

const from = env.MAIL_FROM || env.SMTP_USER || "onboarding@resend.dev";

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export const sendMail = async (mail: MailInput): Promise<void> => {
  if (smtp) {
    try {
      await smtp.sendMail({ from, ...mail });
      return;
    } catch (err) {
      console.error("SMTP send failed", err);
      if (!resend) throw err;
    }
  }

  if (resend) {
    const { error } = await resend.emails.send({ from, ...mail });
    if (error) throw new Error(`Resend error: ${error.message}`);
    return;
  }

  if (!env.isProduction) {
    console.warn(`[mail disabled] To: ${mail.to} | ${mail.subject}\n${mail.text}`);
    return;
  }
  throw new Error("No email transport configured");
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export const sendOtpMail = (
  to: string,
  code: string,
  purpose: "VERIFY_EMAIL" | "RESET_PASSWORD" | "CHANGE_EMAIL"
) => {
  const copy = {
    VERIFY_EMAIL: ["Verify your Food Sharing email", "Use this code to verify your email address."],
    CHANGE_EMAIL: ["Confirm your new Food Sharing email", "Use this code to confirm your new email address."],
    RESET_PASSWORD: ["Reset your Food Sharing password", "Use this code to reset your password."],
  } as const;
  const [subject, lead] = copy[purpose];
  return sendMail({
    to,
    subject,
    text: `${lead}\n\nYour code: ${code}\n\nIt expires in 10 minutes. If you did not request it, ignore this email.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto">
      <h2>Food Sharing</h2><p>${escapeHtml(lead)}</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:700">${escapeHtml(code)}</p>
      <p style="color:#666">It expires in 10 minutes. If you did not request it, you can ignore this email.</p></div>`,
  });
};
