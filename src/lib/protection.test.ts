// Data-protection safeguards (audit G2, G4, G5, G8, G10): owner-only
// actions, the change log, soft delete + restore, stale-save refusals, lead
// history authorship and CMS validation. Runs the real server actions and
// role checks against the in-memory Firestore (src/test/fakedb.ts).

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FakeDb } from "@/test/fakedb";

let db: FakeDb;

const OWNER_UID = "9dFkbPZscRZXAiEkpEVlGNJ1gKm2"; // admin@fibernorth.com
const tokens: Record<string, Record<string, unknown>> = {
  "owner-token": { uid: OWNER_UID, email: "admin@fibernorth.com", email_verified: true },
  "staff-token": { uid: "staff1", email: "chris@fibernorth.com", email_verified: true, admin: true },
  "stranger-token": { uid: "x1", email: "someone@example.com", email_verified: true },
};
const verifyCalls: Array<[string, unknown]> = [];
const authUsers = new Map<string, { uid: string; email: string; disabled: boolean; customClaims?: Record<string, unknown> }>();
const revoked: string[] = [];

vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakedb")).fakeFirestoreModule(() => db));
vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string, checkRevoked?: boolean) => {
      verifyCalls.push([t, checkRevoked]);
      const d = tokens[t];
      if (!d) throw new Error("bad token");
      return d;
    },
    getUserByEmail: async (email: string) => {
      const u = [...authUsers.values()].find((x) => x.email === email);
      if (!u) throw Object.assign(new Error("no user"), { code: "auth/user-not-found" });
      return u;
    },
    getUser: async (uid: string) => {
      const u = authUsers.get(uid);
      if (!u) throw Object.assign(new Error("no user"), { code: "auth/user-not-found" });
      return u;
    },
    createUser: async ({ email }: { email: string }) => {
      const u = { uid: `new-${authUsers.size + 1}`, email, disabled: false };
      authUsers.set(u.uid, u);
      return u;
    },
    updateUser: async (uid: string, patch: Record<string, unknown>) => {
      Object.assign(authUsers.get(uid)!, patch);
    },
    setCustomUserClaims: async (uid: string, claims: Record<string, unknown>) => {
      authUsers.get(uid)!.customClaims = claims;
    },
    revokeRefreshTokens: async (uid: string) => void revoked.push(uid),
  }),
}));
vi.mock("@/services/firebase-admin", () => ({ initializeAdminApp: () => ({}) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ limited: false }), enforceAdminEmailLimit: async () => {} }));
vi.mock("@/services/notifications", () => ({
  sendProposalEmail: vi.fn(async () => ({ id: "re_1", bcc: [] })),
  sendPasswordResetEmail: vi.fn(async () => {}),
}));

import { createDocument, deleteDocument, updateDocument, updateIntegrationSecret, updateSettings } from "@/actions/crud";
import { updatePageContent } from "@/actions/content";
import { saveMarketingSpend } from "@/actions/marketing-spend";
import { saveLead } from "@/actions/leads";
import { deleteQuote, undoAcceptance, updateQuoteContact, updateQuoteListFields } from "@/actions/quotes";
import { purgeTrashItem, restoreTrashItem, listTrash } from "@/actions/trash";
import { listAuditLog } from "@/actions/audit-log";
import { createAdminUser, removeAdminUser } from "@/actions/users";
import { isOwnerIdentity } from "@/lib/admin-allowlist";
import { validateCrudData, STALE_MESSAGE } from "@/lib/crud-schemas";
import { saveLeadServer } from "@/services/lead-writes";
import { HISTORY_MAX_ENTRIES } from "@/lib/history-size";
import type { LeadActivity } from "@/lib/leads";

const audit = () => [...(db.data.auditLog?.values() ?? [])] as Array<Record<string, any>>;
const history = (id = "L1") => (db.get("leads", id)?.activity ?? []) as LeadActivity[];

beforeEach(async () => {
  const { makeDb } = await import("@/test/fakedb");
  db = makeDb();
  verifyCalls.length = 0;
  revoked.length = 0;
  authUsers.clear();
});

describe("roles", () => {
  it("owners are the built-in accounts only; the admin claim alone is staff", () => {
    expect(isOwnerIdentity(OWNER_UID, null, {})).toBe(true);
    expect(isOwnerIdentity("other", "bill@fibernorth.com", { email_verified: true })).toBe(true);
    expect(isOwnerIdentity("other", "bill@fibernorth.com", { email_verified: false })).toBe(false);
    expect(isOwnerIdentity("staff1", "chris@fibernorth.com", { admin: true, email_verified: true })).toBe(false);
  });

  it("checks for revoked tokens", async () => {
    db.put("blog", "B1", { title: "Hi", updatedAt: "t1" });
    await updateDocument("blog", "B1", { title: "Hello" }, "staff-token");
    expect(verifyCalls).toContainEqual(["staff-token", true]);
  });

  it("staff can edit CMS entries but not delete them", async () => {
    db.put("blog", "B1", { title: "Hi", updatedAt: "t1" });
    const r = await deleteDocument("blog", "B1", "staff-token");
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/owner/i) });
    expect(db.get("blog", "B1")).toBeDefined();
    expect(await updateDocument("blog", "B1", { title: "Hello" }, "staff-token")).toEqual({ ok: true });
  });

  it("non-admins get nothing", async () => {
    expect((await createDocument("blog", { title: "x" }, "stranger-token")).ok).toBe(false);
  });

  it("staff can't redirect notifications or touch integration keys; other settings are fine", async () => {
    db.put("siteSettings", "general", { companyName: "FiberNorth", quoteEmailTo: "bill@fibernorth.com" });
    const bad = await updateSettings("general", { quoteEmailTo: "thief@example.com" }, "staff-token");
    expect(bad.ok).toBe(false);
    expect(db.get("siteSettings", "general")!.quoteEmailTo).toBe("bill@fibernorth.com");
    expect(await updateSettings("general", { phone: "231-555-0100" }, "staff-token")).toEqual({ ok: true });
    expect(db.get("siteSettings", "general")).toMatchObject({ phone: "231-555-0100", companyName: "FiberNorth" });
    expect((await updateIntegrationSecret("boreOn", { baseUrl: "https://evil.example" }, "staff-token")).ok).toBe(false);
    expect(await updateSettings("general", { quoteEmailTo: "office@fibernorth.com" }, "owner-token")).toEqual({ ok: true });
  });

  it("staff can't add or remove admins; an owner's changes are logged and revoke tokens", async () => {
    await expect(createAdminUser({ email: "new@fibernorth.com", name: "New", password: "longenough" }, "staff-token")).rejects.toThrow(/owner/i);
    const { uid } = await createAdminUser({ email: "new@fibernorth.com", name: "New", password: "longenough" }, "owner-token");
    expect(authUsers.get(uid)!.customClaims).toMatchObject({ admin: true });
    await expect(removeAdminUser(uid, "staff-token")).rejects.toThrow(/owner/i);
    await removeAdminUser(uid, "owner-token");
    expect(authUsers.get(uid)).toMatchObject({ disabled: true, customClaims: { admin: false } });
    expect(revoked).toContain(uid);
    expect(audit().map((a) => a.action)).toEqual(expect.arrayContaining(["user.create", "user.remove"]));
    expect(audit().every((a) => a.actor.email === "admin@fibernorth.com")).toBe(true);
  });

  it("the change log and trash are owner only", async () => {
    await expect(listAuditLog("staff-token")).rejects.toThrow(/owner/i);
    await expect(listTrash("staff-token")).rejects.toThrow(/owner/i);
    expect((await restoreTrashItem("blog__B1", "staff-token")).ok).toBe(false);
  });
});

describe("change log", () => {
  it("records CRUD before -> after of the changed fields only", async () => {
    db.put("testimonials", "T1", { name: "Pat", text: "Great", rating: 5, updatedAt: "t1" });
    await updateDocument("testimonials", "T1", { name: "Pat", text: "Great work" }, "staff-token");
    const [e] = audit();
    expect(e).toMatchObject({
      action: "crud.update",
      actor: { uid: "staff1", email: "chris@fibernorth.com" },
      target: { col: "testimonials", id: "T1" },
      before: { text: "Great" },
      after: { text: "Great work" },
    });
    expect(e.after).not.toHaveProperty("name");
  });

  it("masks integration secrets but shows which fields changed", async () => {
    db.put("integrationSecrets", "boreOn", { baseUrl: "https://bore-on.com", apiKey: "old-key-123456789" });
    const r = await updateIntegrationSecret("boreOn", { apiKey: "new-key-abcdefghij", baseUrl: "https://bore-on.com/v2" }, "owner-token");
    expect(r).toEqual({ ok: true });
    const [e] = audit();
    expect(e.before).toEqual({ apiKey: "(set)", baseUrl: "https://bore-on.com" });
    expect(e.after).toEqual({ apiKey: "(set)", baseUrl: "https://bore-on.com/v2" });
    expect(JSON.stringify(e)).not.toContain("new-key");
    expect(JSON.stringify(e)).not.toContain("old-key");
  });

  it("refuses a non-https Bore-ON URL and unknown integration fields", async () => {
    expect((await updateIntegrationSecret("boreOn", { baseUrl: "http://evil.example" }, "owner-token")).ok).toBe(false);
    expect((await updateIntegrationSecret("boreOn", { refreshToken: "x" }, "owner-token")).ok).toBe(false);
    expect((await updateIntegrationSecret("somethingElse", { a: "x" }, "owner-token")).ok).toBe(false);
  });

  it("lists newest first and filters by collection and person", async () => {
    db.put("blog", "B1", { title: "A", updatedAt: "" });
    db.put("siteSettings", "general", { phone: "1" });
    await updateDocument("blog", "B1", { title: "B" }, "staff-token");
    await updateSettings("general", { phone: "2" }, "owner-token");
    const all = await listAuditLog("owner-token");
    expect(all.length).toBe(2);
    expect(all[0].at >= all[1].at).toBe(true);
    expect((await listAuditLog("owner-token", { col: "blog" })).map((e) => e.target.col)).toEqual(["blog"]);
    expect((await listAuditLog("owner-token", { actor: "chris" })).map((e) => e.actor.email)).toEqual(["chris@fibernorth.com"]);
  });
});

describe("CMS validation", () => {
  it("refuses unknown fields, wrong types and oversize values", () => {
    expect(validateCrudData("blog", { title: "x", evil: 1 }, "create")).toEqual({ ok: false, error: "Unknown field: evil" });
    expect(validateCrudData("testimonials", { rating: 9 }, "update").ok).toBe(false);
    expect(validateCrudData("team", { bio: "x".repeat(6000) }, "update").ok).toBe(false);
    expect(validateCrudData("siteSettings", { phone: "1" }, "update").ok).toBe(false);
    expect(validateCrudData("jobApplications", { name: "x" }, "create").ok).toBe(false);
    expect(validateCrudData("jobApplications", { status: "hired", notes: "ok" }, "update").ok).toBe(true);
    // Server-set keys a form copied along are dropped, not refused.
    expect(validateCrudData("fleet", { id: "F1", createdAt: "x", updatedAt: "y", name: "Rig" }, "update")).toEqual({
      ok: true,
      data: { name: "Rig" },
    });
  });

  it("each admin page's default values pass", () => {
    const defaults: Record<string, Record<string, unknown>> = {
      blog: { title: "", slug: "", excerpt: "", content: "", coverImage: "", author: "Bill Gaylord", tags: [], category: "", isPublished: false, publishedAt: "", metaTitle: "", metaDescription: "" },
      fleet: { name: "", year: 0, model: "", manufacturer: "", capability: "", description: "", image: "", isActive: true, sortOrder: 0 },
      jobPostings: { title: "", payRange: "", season: "", schedule: "", duties: [], requirements: [], type: "seasonal", indeedUrl: "", isActive: true, sortOrder: 0 },
      majorProjects: { title: "", client: "", description: "", images: [], scope: "", duration: "", location: "", isPublished: false, sortOrder: 0 },
      projects: { title: "", description: "", category: "", images: [], location: "", date: "", isPublished: false, sortOrder: 0 },
      team: { name: "", title: "", bio: "", photo: "", sortOrder: 0, isActive: true },
      testimonials: { name: "", location: "", text: "", rating: 5, projectType: "", isVisible: true },
      bids: { title: "", agency: "", county: "", role: "prime", source: "", docsUrl: "", dueDate: "", status: "tracking", amount: "", notes: "" },
    };
    for (const [c, d] of Object.entries(defaults)) expect(validateCrudData(c, d, "create")).toMatchObject({ ok: true });
  });

  it("createDocument refuses bad data and writes nothing", async () => {
    expect((await createDocument("blog", { title: "x", role: "admin" }, "staff-token")).ok).toBe(false);
    expect(db.data.blog?.size ?? 0).toBe(0);
    const r = await createDocument("blog", { title: "Post" }, "staff-token");
    expect(r.ok).toBe(true);
    expect(audit()[0]).toMatchObject({ action: "crud.create", after: { title: "Post" } });
  });
});

describe("stale saves", () => {
  it("CRUD edit refuses a save over a newer version", async () => {
    db.put("bids", "X", { title: "Road bore", notes: "", updatedAt: "2026-09-26T10:00:00.000Z" });
    const stale = await updateDocument("bids", "X", { notes: "mine" }, "staff-token", { baseUpdatedAt: "2026-09-25T00:00:00.000Z" });
    expect(stale).toEqual({ ok: false, error: STALE_MESSAGE });
    expect(db.get("bids", "X")!.notes).toBe("");
    const ok = await updateDocument("bids", "X", { notes: "mine" }, "staff-token", { baseUpdatedAt: "2026-09-26T10:00:00.000Z" });
    expect(ok).toEqual({ ok: true });
  });

  it("page content: refuses stale saves and fields the page doesn't have", async () => {
    db.put("siteContent", "home", { heroTitle: "A", updatedAt: "t2" });
    expect(await updatePageContent("home", { heroTitle: "B" }, "staff-token", "t1")).toEqual({ ok: false, error: STALE_MESSAGE });
    expect((await updatePageContent("home", { story: "x" }, "staff-token", "t2")).ok).toBe(false);
    const r = await updatePageContent("home", { heroTitle: "B" }, "staff-token", "t2");
    expect(r.ok).toBe(true);
    expect(db.get("siteContent", "home")!.heroTitle).toBe("B");
    expect(audit()[0]).toMatchObject({ action: "content.update", before: { heroTitle: "A" }, after: { heroTitle: "B" } });
  });

  it("marketing spend: refuses a stale month and logs before -> after", async () => {
    db.put("marketingSpend", "2026-09", { "meta-ads": 600, updatedAt: "t2", updatedBy: "bill@fibernorth.com" });
    const stale = await saveMarketingSpend("2026-09", { "meta-ads": "700" }, "staff-token", "t1");
    expect(stale).toEqual({ ok: false, error: expect.stringContaining("bill@fibernorth.com") });
    expect(await saveMarketingSpend("2026-09", { "meta-ads": "700" }, "staff-token", "t2")).toEqual({ ok: true });
    expect(db.get("marketingSpend", "2026-09")!["meta-ads"]).toBe(700);
    expect(audit()[0]).toMatchObject({ action: "spend.update", before: { "meta-ads": 600 }, after: { "meta-ads": 700 } });
    // A month nobody saved yet: base "".
    expect(await saveMarketingSpend("2026-08", { "meta-ads": "5" }, "staff-token", "")).toEqual({ ok: true });
  });

  it("quote contact: refuses a field changed since the form opened, updates the lead with a signed line", async () => {
    db.put("quoteRequests", "Q1", { name: "Pat", phone: "231-555-0001", email: "", address: "1 Main", leadId: "L1" });
    db.put("leads", "L1", { name: "Pat", phone: "231-555-0001", email: "", address: "1 Main", activity: [] });
    const base = { name: "Pat", phone: "231-555-0000", email: "", address: "1 Main" };
    const stale = await updateQuoteContact("Q1", { name: "Pat", phone: "231-555-0009", email: "", address: "1 Main", base }, "staff-token");
    expect(stale).toEqual({ ok: false, error: expect.stringContaining("Phone") });
    const ok = await updateQuoteContact(
      "Q1",
      { name: "Pat", phone: "231-555-0009", email: "", address: "1 Main", base: { ...base, phone: "231-555-0001" } },
      "staff-token"
    );
    expect(ok).toEqual({ ok: true });
    expect(db.get("leads", "L1")!.phone).toBe("231-555-0009");
    expect(history()).toContainEqual(
      expect.objectContaining({ text: "Phone: 231-555-0001 → 231-555-0009 (fixed on the quote)", by: "chris@fibernorth.com" })
    );
    expect(audit()[0]).toMatchObject({ action: "quote.contact", before: { phone: "231-555-0001" }, after: { phone: "231-555-0009" } });
  });

  it("quote list notes: refuses a save over notes someone else changed", async () => {
    db.put("quoteRequests", "Q1", { name: "Pat", notes: "theirs", status: "new" });
    const stale = await updateQuoteListFields("Q1", { notes: "mine", baseNotes: "" }, "staff-token");
    expect(stale.ok).toBe(false);
    expect(db.get("quoteRequests", "Q1")!.notes).toBe("theirs");
    expect(await updateQuoteListFields("Q1", { notes: "theirs + mine", baseNotes: "theirs" }, "staff-token")).toEqual({ ok: true });
    expect(await updateQuoteListFields("Q1", { status: "closed" }, "staff-token")).toEqual({ ok: true });
    expect(audit().map((a) => a.after)).toEqual(expect.arrayContaining([{ notes: "theirs + mine" }, { status: "closed" }]));
  });
});

describe("lead history authorship and field changes", () => {
  beforeEach(() => {
    db.put("leads", "L1", {
      name: "Pat",
      phone: "231-555-0001",
      saleAmount: "18400",
      notes: "",
      stage: "contacted",
      activity: [],
    });
  });

  it("signs the line and records each changed contact/money field", async () => {
    const r = await saveLead("L1", { phone: "231-555-0002", saleAmount: "1840", name: "Pat" }, null, "staff-token");
    expect(r).toEqual({ ok: true });
    const texts = history().map((a) => [a.text, a.by]);
    expect(texts).toContainEqual(["Phone: 231-555-0001 → 231-555-0002", "chris@fibernorth.com"]);
    expect(texts).toContainEqual(["Total sale: 18400 → 1840", "chris@fibernorth.com"]);
    expect(texts.some(([t]) => String(t).startsWith("Name:"))).toBe(false);
  });

  it("a logged call carries who logged it; the client can't claim someone else", async () => {
    await saveLead("L1", {}, { ts: "2026-09-26T12:00:00.000Z", type: "call", text: "Talked", by: "bill@fibernorth.com" }, "staff-token");
    expect(history()[0]).toMatchObject({ type: "call", by: "chris@fibernorth.com" });
  });

  it("truncates long notes in the change line", async () => {
    await saveLead("L1", { notes: "n".repeat(200) }, null, "staff-token");
    const line = history().find((a) => a.text.startsWith("Notes:"))!;
    expect(line.text.length).toBeLessThan(100);
  });

  it("refuses a field someone changed after the form opened, naming it and who", async () => {
    await saveLead("L1", { phone: "231-555-0002" }, null, "owner-token");
    const r = await saveLead("L1", { phone: "231-555-0003", base: { phone: "231-555-0001" } }, null, "staff-token");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("Phone");
      expect(r.error).toContain("admin@fibernorth.com");
    }
    expect(db.get("leads", "L1")!.phone).toBe("231-555-0002");
    // Same base as stored: saves.
    expect(await saveLead("L1", { phone: "231-555-0003", base: { phone: "231-555-0002" } }, null, "staff-token")).toEqual({ ok: true });
    // Already what's being saved (a retry): no conflict.
    expect(await saveLead("L1", { phone: "231-555-0003", base: { phone: "231-555-0001" } }, null, "staff-token")).toEqual({ ok: true });
  });

  it("archives the oldest history when the lead nears the size limit", async () => {
    const old = Array.from({ length: HISTORY_MAX_ENTRIES }, (_, i) => ({
      ts: new Date(Date.UTC(2025, 0, 1, 0, 0, i)).toISOString(),
      type: "note",
      text: `old ${i}`,
    }));
    db.put("leads", "L1", { name: "Pat", stage: "contacted", activity: old });
    await saveLeadServer(db as never, "L1", {}, { ts: "2026-09-26T12:00:00.000Z", type: "note", text: "new" }, { by: "chris@fibernorth.com" });
    const kept = history();
    expect(kept.length).toBeLessThan(HISTORY_MAX_ENTRIES);
    expect(kept[kept.length - 1]).toMatchObject({ text: "new", by: "chris@fibernorth.com" });
    const archived = [...(db.data["leads/L1/historyArchive"]?.values() ?? [])].flatMap((d) => d.entries);
    expect(archived.length + kept.length).toBe(HISTORY_MAX_ENTRIES + 1);
  });
});

describe("soft delete and restore", () => {
  it("a CMS delete goes to the trash and restores; a restore never overwrites", async () => {
    db.put("testimonials", "T1", { name: "Pat", text: "Great", updatedAt: "t1" });
    expect(await deleteDocument("testimonials", "T1", "owner-token")).toEqual({ ok: true });
    expect(db.get("testimonials", "T1")).toBeUndefined();
    const t = db.get("trash", "testimonials__T1")!;
    expect(t).toMatchObject({ col: "testimonials", id: "T1", data: { name: "Pat" }, deletedBy: "admin@fibernorth.com" });
    expect(audit()[0]).toMatchObject({ action: "crud.delete", before: { name: "Pat" }, after: null });

    const items = await listTrash("owner-token");
    expect(items).toEqual([expect.objectContaining({ trashId: "testimonials__T1", label: "Pat" })]);

    db.put("testimonials", "T1", { name: "Someone new" });
    expect((await restoreTrashItem("testimonials__T1", "owner-token")).ok).toBe(false);
    expect(db.get("testimonials", "T1")!.name).toBe("Someone new");
    db.data.testimonials.delete("T1");
    expect(await restoreTrashItem("testimonials__T1", "owner-token")).toEqual({ ok: true });
    expect(db.get("testimonials", "T1")).toMatchObject({ name: "Pat", text: "Great" });
    expect(db.get("trash", "testimonials__T1")).toBeUndefined();
  });

  it("siteSettings and siteContent can't be deleted through the CMS", async () => {
    db.put("siteSettings", "general", { phone: "1" });
    expect((await deleteDocument("siteSettings", "general", "owner-token")).ok).toBe(false);
    expect(db.get("siteSettings", "general")).toBeDefined();
  });

  it("purges for good", async () => {
    db.put("bids", "X", { title: "Road bore" });
    await deleteDocument("bids", "X", "owner-token");
    expect(await purgeTrashItem("bids__X", "owner-token")).toEqual({ ok: true });
    expect(db.get("trash", "bids__X")).toBeUndefined();
    expect(audit().map((a) => a.action)).toContain("trash.purge");
  });

  it("deleteQuote is owner only, voids links, trashes the quote; restore relinks the lead as a draft", async () => {
    db.put("leads", "L1", { name: "Pat", stage: "quoted", quoteId: "Q1", quoteCount: 1, activity: [] });
    db.put("quoteRequests", "Q1", {
      name: "Pat",
      address: "1 Main",
      leadId: "L1",
      estimateStatus: "sent",
      version: 1,
      proposalId: "P1",
      sentAt: "2026-09-20T00:00:00.000Z",
      createdAt: "2026-09-19T00:00:00.000Z",
    });
    db.put("proposals", "P1", { quoteId: "Q1", leadId: "L1", status: "sent", version: 1 });

    await expect(deleteQuote("Q1", "staff-token")).rejects.toThrow(/owner/i);
    expect(db.get("quoteRequests", "Q1")).toBeDefined();

    await deleteQuote("Q1", "owner-token");
    expect(db.get("quoteRequests", "Q1")).toBeUndefined();
    expect(db.get("proposals", "P1")!.status).toBe("void");
    expect(db.get("trash", "quoteRequests__Q1")).toMatchObject({ voidedProposals: ["P1"], data: { address: "1 Main" } });
    expect(db.get("leads", "L1")!.quoteCount).toBe(0);
    expect(history().at(-1)).toMatchObject({ by: "admin@fibernorth.com" });

    expect(await restoreTrashItem("quoteRequests__Q1", "owner-token")).toEqual({ ok: true });
    const q = db.get("quoteRequests", "Q1")!;
    expect(q).toMatchObject({ estimateStatus: "draft", voidedProposalId: "P1", address: "1 Main" });
    expect(q.proposalId).toBeUndefined();
    expect(db.get("proposals", "P1")!.status).toBe("void");
    expect(db.get("leads", "L1")).toMatchObject({ quoteId: "Q1", quoteCount: 1 });
    expect(history().at(-1)!.text).toMatch(/restored from the trash/);
  });
});

describe("undo acceptance keeps the e-signature evidence", () => {
  it("moves the acceptance fields to acceptanceHistory with who undid it", async () => {
    db.put("leads", "L1", { name: "Pat", stage: "won", quoteId: "Q1", saleAmount: "", activity: [], quote: { status: "accepted" } });
    db.put("quoteRequests", "Q1", { name: "Pat", leadId: "L1", estimateStatus: "accepted", version: 1, proposalId: "P1", acceptedAt: "2026-09-21T00:00:00.000Z" });
    db.put("proposals", "P1", {
      quoteId: "Q1",
      leadId: "L1",
      status: "accepted",
      version: 1,
      totals: { work: 100, materials: 0, tax: 0, total: 100 },
      acceptedAt: "2026-09-21T00:00:00.000Z",
      acceptedName: "Pat Jones",
      acceptedIp: "1.2.3.4",
      acceptedUa: "Safari",
    });
    await undoAcceptance("Q1", "staff-token");
    const p = db.get("proposals", "P1")!;
    expect(p.status).toBe("sent");
    expect(p.acceptedName).toBeUndefined();
    expect(p.acceptanceHistory).toEqual([
      {
        acceptedAt: "2026-09-21T00:00:00.000Z",
        acceptedName: "Pat Jones",
        acceptedIp: "1.2.3.4",
        acceptedUa: "Safari",
        undoneAt: expect.any(String),
        undoneBy: "chris@fibernorth.com",
      },
    ]);
    expect(audit()[0]).toMatchObject({ action: "quote.undoAcceptance", before: { acceptedName: "Pat Jones" } });
    expect(history()[0]).toMatchObject({ by: "chris@fibernorth.com" });
  });
});
