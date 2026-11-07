import { HttpException } from "../core/http-exception";

/**
 * Test accounts for trying the platform. The password is intentionally public (the
 * login page shows it), so these accounts are locked down: they cannot change
 * sign-in details or delete themselves, and a demo admin can only manage other
 * demo data, never real members.
 */
export const DEMO_PASSWORD = "ShareDemo#2026";

export const DEMO_ACCOUNTS = [
  { role: "ADMIN", label: "Admin", email: "admin@foodshare.demo" },
  { role: "USER", label: "User", email: "user@foodshare.demo" },
] as const;

export const assertNotDemo = (actor: { isDemo?: boolean } | undefined, what: string) => {
  if (actor?.isDemo) {
    throw new HttpException(403, `Test accounts cannot ${what}. Create your own account to try it.`);
  }
};
