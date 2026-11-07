import { describe, it, expect } from "vitest";
import { unsentDrafts, unsentDraftsTotal } from "./quote-track";
import { textLogSaved } from "@/components/admin/text-picker";

describe("unsentDrafts (Quotes not sent)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = (id: string, p: Record<string, unknown>) => ({ id, name: id, createdAt: "2026-11-01T15:00:00.000Z", leadId: "L1", ...p }) as any;
  const today = "2026-11-07";
  it("drafts on a lead more than 2 days old, oldest first, with age and price", () => {
    const list = [
      q("newer", { createdAt: "2026-11-04T15:00:00.000Z", quotedPrice: 3000 }),
      q("older", { createdAt: "2026-10-20T15:00:00.000Z", version: 0, quotedPrice: 6200.5 }),
      q("noPrice", { createdAt: "2026-11-02T15:00:00.000Z" }),
    ];
    expect(unsentDrafts(list, today)).toEqual([
      { id: "older", name: "older", leadId: "L1", ageDays: 18, price: 6200.5 },
      { id: "noPrice", name: "noPrice", leadId: "L1", ageDays: 5, price: null },
      { id: "newer", name: "newer", leadId: "L1", ageDays: 3, price: 3000 },
    ]);
    expect(unsentDraftsTotal(unsentDrafts(list, today))).toBe(9200.5);
  });
  it("leaves out sent, fresh, lead-less, deleted and finished quotes", () => {
    const list = [
      q("sent", { version: 1 }),
      q("twoDays", { createdAt: "2026-11-05T15:00:00.000Z" }),
      q("noLead", { leadId: "" }),
      q("deleted", { deleted: true }),
      q("done", { jobDoneAt: "2026-11-02" }),
      q("keep", {}),
    ];
    expect(unsentDrafts(list, today).map((d) => d.id)).toEqual(["keep"]);
  });
});

describe("text picker: Logged only when the save went through", () => {
  it("ok and queued count; an error or nothing doesn't", () => {
    expect(textLogSaved("ok")).toBe(true);
    expect(textLogSaved("queued")).toBe(true);
    expect(textLogSaved("error")).toBe(false);
    expect(textLogSaved(undefined)).toBe(false);
  });
});
