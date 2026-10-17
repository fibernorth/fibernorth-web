// Admin roles, the private ("Just mine") lead rule and the quote approval
// rule. Pure (no Firebase imports) so the client, the server and tests share
// one copy.
//
// Roles:
// - owner: the built-in accounts (src/lib/admin-allowlist.ts isOwnerIdentity).
// - staff: added under Admin -> Users (custom claim admin: true).
// - sales: staff with the extra custom claim role: "sales", set by an owner
//   on the Users page. Sees only the daily work (leads, quotes, calendar,
//   bid board), and quotes they send go through the approval queue.

export type AdminRole = "owner" | "staff" | "sales";

/** The role from the owner check and the token's custom claims. */
export function roleOf(owner: boolean, claims?: Record<string, unknown> | null): AdminRole {
  if (owner) return "owner";
  return claims?.role === "sales" ? "sales" : "staff";
}

/** The role values an owner can give someone on the Users page. */
export const ASSIGNABLE_ROLES = ["staff", "sales"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const ROLE_LABELS: Record<AdminRole, string> = {
  owner: "Owner",
  staff: "Office",
  sales: "Sales",
};

/** Shown when a sales account tries something its account doesn't have. */
export const SALES_DENIED_MESSAGE = "Not available on your account.";

export type Permission =
  | "leads.work" // call/text/email/log/book/schedule/create, put under contractor
  | "quotes.build" // build, save, push to Bore-ON, send (sales: through approval)
  | "quotes.quickbooks" // send an accepted quote to QuickBooks
  | "bids.edit"
  | "leads.merge"
  | "leads.delete" // trash, merge's drop side, import undo, empty trash
  | "leads.private" // see and set "Just mine" leads
  | "website.edit" // pages, projects, fleet, team, blog, testimonials, jobs
  | "applications"
  | "settings" // company settings, integrations, pricing, marketing spend
  | "users.manage"
  | "changelog";

const STAFF: ReadonlySet<Permission> = new Set<Permission>([
  "leads.work",
  "quotes.build",
  "quotes.quickbooks",
  "bids.edit",
  "website.edit",
  "applications",
  "settings",
]);

const SALES: ReadonlySet<Permission> = new Set<Permission>(["leads.work", "quotes.build", "quotes.quickbooks", "bids.edit"]);

/**
 * What each role may do. Owners: everything. Staff keep what they had before
 * roles existed (everything but the owner-only list). Sales: the daily work.
 * The server checks each action itself; this map drives the screens and the
 * sales denials in the server actions.
 */
export function can(role: AdminRole, perm: Permission): boolean {
  if (role === "owner") return true;
  return (role === "sales" ? SALES : STAFF).has(perm);
}

/** Admin pages a sales account may open (exact, or anything under it). */
export const SALES_PAGES: readonly string[] = ["/admin", "/admin/leads", "/admin/quotes", "/admin/calendar", "/admin/bids", "/admin/me"];

/** Whether this role may open the admin page at `pathname`. */
export function canOpenPage(role: AdminRole, pathname: string): boolean {
  if (role !== "sales") return true;
  const path = (pathname || "").replace(/\/+$/, "") || "/";
  return SALES_PAGES.some((p) => path === p || (p !== "/admin" && path.startsWith(`${p}/`)));
}

// ---------------------------------------------------------------- private leads

/** A "Just mine" lead: only owners see it. */
export function isPrivateLead(lead: { private?: unknown } | null | undefined): boolean {
  return lead?.private === true;
}

/** The leads this person may see: all for owners, the non-private ones otherwise. */
export function visibleLeads<T extends { private?: unknown }>(leads: T[], owner: boolean): T[] {
  return owner ? leads : leads.filter((l) => !isPrivateLead(l));
}

/**
 * The quotes this person may see. A quote of a private lead carries
 * leadPrivate (set when the lead is marked); `privateLeadIds` also catches
 * one made before that, when the caller has the leads at hand.
 */
export function visibleQuotes<T extends { leadId?: string; leadPrivate?: unknown }>(
  quotes: T[],
  owner: boolean,
  privateLeadIds?: ReadonlySet<string>
): T[] {
  if (owner) return quotes;
  return quotes.filter((q) => q.leadPrivate !== true && !(q.leadId && privateLeadIds?.has(q.leadId)));
}

// ---------------------------------------------------------------- approvals

/** Who approves when nothing is saved in Settings yet. */
export const DEFAULT_APPROVERS: readonly string[] = ["bill@fibernorth.com", "chris@fibernorth.com", "admin@fibernorth.com"];

export interface ApprovalSettings {
  /** Lowercased emails. Owners always approve, listed or not. */
  approvers: string[];
  /** While on, every quote a sales account sends waits for approval. */
  trainingMode: boolean;
}

export const DEFAULT_APPROVAL_SETTINGS: ApprovalSettings = { approvers: [...DEFAULT_APPROVERS], trainingMode: true };

const EMAIL_RE = /^[^@\s,]+@[^@\s,]+\.[^@\s,]+$/;

/** Clean an approver list: lowercased, valid, no repeats, at most 20. */
export function cleanApprovers(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[\s,;]+/) : [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const e = v.trim().toLowerCase();
    if (e && EMAIL_RE.test(e) && !out.includes(e)) out.push(e);
  }
  return out.slice(0, 20);
}

/** The stored settings doc, with defaults for anything missing. */
export function readApprovalSettings(doc: Record<string, unknown> | null | undefined): ApprovalSettings {
  const approvers = doc && Array.isArray(doc.approvers) ? cleanApprovers(doc.approvers) : [...DEFAULT_APPROVERS];
  const trainingMode = doc && typeof doc.trainingMode === "boolean" ? doc.trainingMode : true;
  return { approvers, trainingMode };
}

/**
 * Owners always approve. Others when their email is on the list, except a
 * sales account: it can never approve its own work (so changing the email
 * on a sales login to an approver's doesn't help).
 */
export function isApprover(
  who: { role: AdminRole; email?: string | null },
  settings: Pick<ApprovalSettings, "approvers">
): boolean {
  if (who.role === "owner") return true;
  if (who.role === "sales") return false;
  const email = (who.email || "").trim().toLowerCase();
  return !!email && settings.approvers.includes(email);
}

export interface ApprovalInput {
  role: AdminRole;
  trainingMode: boolean;
  /** Set on the quote by the price rules ("Below the price rules"). */
  needsApprovalReason?: string | null;
  isApprover: boolean;
}

/**
 * Why this send has to wait for an approver, or null when it can go now.
 * Approvers send at once. Only sales accounts wait: on everything while
 * training mode is on, otherwise only when the quote has a reason set.
 */
export function approvalReason(input: ApprovalInput): string | null {
  if (input.isApprover || input.role !== "sales") return null;
  if (input.trainingMode) return "Training mode";
  const r = (input.needsApprovalReason || "").trim();
  return r ? r : null;
}

export function needsApproval(input: ApprovalInput): boolean {
  return approvalReason(input) !== null;
}

export type ApprovalStatus = "pending" | "approved" | "returned";

/** Why a quote can't go to QuickBooks yet, or null when it may. */
export function quickBooksBlock(quote: { estimateStatus?: string; approvalStatus?: string; qboEstimateId?: string }): string | null {
  if (quote.approvalStatus === "pending") return "This quote is waiting for approval, so it can't go to QuickBooks.";
  if (quote.estimateStatus !== "accepted" && !quote.qboEstimateId) return "Only accepted quotes go to QuickBooks.";
  return null;
}

/** Throws SALES_DENIED_MESSAGE for a sales account (server actions). */
export function assertNotSales(caller: { role?: AdminRole }): void {
  if (caller.role === "sales") throw new Error(SALES_DENIED_MESSAGE);
}
