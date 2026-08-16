// Single source of truth for which Firebase Auth accounts are admins.
// Public sign-up has been reachable on this project, so "any valid token"
// must never be treated as authorization — always check against this list.
// Keep in sync with the UID allowlist in firestore.rules and storage.rules.
export const ADMIN_UIDS: ReadonlySet<string> = new Set([
  "9dFkbPZscRZXAiEkpEVlGNJ1gKm2", // admin@fibernorth.com
  "GNYhCjyGudc2qnDoVzRnxCH4kuw2", // bill@fibernorth.com (original UID)
  "2CIJrJ2DgxXIBULzPEb76mArbWX2", // webadmin@fibernorth.com
]);

// Email allowlist so a deleted-and-recreated admin account (new UID) still
// works. Safe only while public sign-up is disabled in Firebase Auth.
export const ADMIN_EMAILS: ReadonlySet<string> = new Set([
  "admin@fibernorth.com",
  "bill@fibernorth.com",
  "webadmin@fibernorth.com",
]);

export function isAdminIdentity(uid: string, email?: string | null): boolean {
  if (ADMIN_UIDS.has(uid)) return true;
  return !!email && ADMIN_EMAILS.has(email.toLowerCase());
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
  "quoteRequests",
  "jobApplications",
  "users",
]);
