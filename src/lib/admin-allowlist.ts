// Single source of truth for which Firebase Auth accounts are admins.
// Public sign-up has been reachable on this project, so "any valid token"
// must never be treated as authorization — always check against this list
// or the `admin: true` custom claim set by Admin -> Users.
// Keep the UID/email lists in sync with firestore.rules and storage.rules.
export const ADMIN_UIDS: ReadonlySet<string> = new Set([
  "9dFkbPZscRZXAiEkpEVlGNJ1gKm2", // admin@fibernorth.com
  "GNYhCjyGudc2qnDoVzRnxCH4kuw2", // bill@fibernorth.com (original UID)
  "2CIJrJ2DgxXIBULzPEb76mArbWX2", // webadmin@fibernorth.com
]);

// Email allowlist so a deleted-and-recreated admin account (new UID) still
// works. Only honoured when Firebase says the email is verified
// (email_verified === true on the ID token) — otherwise anyone who could
// create an account with, or change an account's email to, one of these
// addresses would become admin. Public sign-up should also stay disabled.
export const ADMIN_EMAILS: ReadonlySet<string> = new Set([
  "admin@fibernorth.com",
  "bill@fibernorth.com",
  "webadmin@fibernorth.com",
]);

export function isAdminIdentity(
  uid: string,
  email?: string | null,
  claims?: Record<string, unknown> | null
): boolean {
  if (ADMIN_UIDS.has(uid)) return true;
  if (claims?.admin === true) return true;
  return (
    !!email &&
    claims?.email_verified === true &&
    ADMIN_EMAILS.has(email.toLowerCase())
  );
}

// Collections the admin CMS is allowed to manage through server actions.
export const ADMIN_COLLECTIONS: ReadonlySet<string> = new Set([
  "siteContent",
  "services",
  "projects",
  "majorProjects",
  "fleet",
  "team",
  "blog",
  "testimonials",
  "jobPostings",
  "siteSettings",
  "jobApplications",
  "users",
  "bids",
  // Not "leads" or "marketingSpend": those are written only through their
  // own server actions (src/actions/leads.ts, marketing-spend.ts), which
  // validate every field. Nor "quoteRequests": quotes change only through
  // src/actions/quotes.ts.
]);
