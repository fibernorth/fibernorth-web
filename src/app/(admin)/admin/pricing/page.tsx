"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Plus, Save, Tags, X } from "lucide-react";
import { useAuth } from "@/context/auth-provider";
import { useIsOwner } from "@/hooks/use-is-owner";
import { OwnerOnlyNote } from "@/components/admin/owner-only";
import { getPricing, savePricing } from "@/actions/pricing";
import {
  DEFAULT_PRICING_RULES,
  PRICE_UNITS,
  quoteRules,
  type PriceItem,
  type PricingRules,
  type PricingSettings,
} from "@/lib/quote-rules";
import { cn } from "@/lib/utils";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: Number.isInteger(n) ? 0 : 2 });

// The rules form, in the order Bill reads them.
const RULE_FIELDS: Array<{ key: keyof PricingRules; label: string; hint: string; prefix?: string; suffix?: string }> = [
  { key: "perPersonDay", label: "Crew rate", prefix: "$", suffix: "per person per day", hint: "Base labor = people × days × this." },
  { key: "shortMaxFeet", label: "Covered line", suffix: "ft", hint: "One line up to this long is covered by the crew's day." },
  { key: "extraShortLine", label: "Each extra short line", prefix: "$", hint: "Another line up to the covered length, same day and crew." },
  { key: "midMaxFeet", label: "Mid line up to", suffix: "ft", hint: "Lines over the covered length up to this." },
  { key: "midPrice", label: "Mid line price", prefix: "$", hint: "Price of one such line." },
  { key: "longMaxFeet", label: "Long line up to", suffix: "ft", hint: "Lines over the mid length up to this." },
  { key: "longPrice", label: "Long line price", prefix: "$", hint: "Price of one such line." },
  { key: "perFootOver", label: "Over that", prefix: "$", suffix: "per foot", hint: "Lines longer than the long length." },
  { key: "minPerManDay", label: "Lowest labor per man-day", prefix: "$", hint: "Quotes under this need approval." },
  { key: "defaultPeople", label: "Quote builder starts with", suffix: "people", hint: "Changeable on each quote." },
  { key: "defaultDays", label: "…and", suffix: "days", hint: "Changeable on each quote." },
];

type RuleDraft = Record<keyof PricingRules, string>;
type ItemDraft = Omit<PriceItem, "price"> & { price: string };

const toRuleDraft = (r: PricingRules): RuleDraft =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])) as RuleDraft;
const toItemDraft = (i: PriceItem): ItemDraft => ({ ...i, price: i.price === null ? "" : String(i.price) });

function parseRules(d: RuleDraft): PricingRules {
  const out = { ...DEFAULT_PRICING_RULES };
  (Object.keys(out) as Array<keyof PricingRules>).forEach((k) => {
    const n = Number(String(d[k] ?? "").replace(/[$,\s]/g, ""));
    if (String(d[k] ?? "").trim() !== "" && Number.isFinite(n) && n >= 0) out[k] = n;
  });
  return out;
}

const EXAMPLES: Array<{ label: string; people: number; days: number; feet: number[] }> = [
  { label: "2 people, 1 day, one 120 ft line", people: 2, days: 1, feet: [120] },
  { label: "2 people, 1 day, two lines under 150 ft", people: 2, days: 1, feet: [120, 90] },
  { label: "2 people, 1 day, one 250 ft line", people: 2, days: 1, feet: [250] },
  { label: "2 people, 1 day, 250 ft + 100 ft", people: 2, days: 1, feet: [250, 100] },
  { label: "2 people, 2 days, one 420 ft line", people: 2, days: 2, feet: [420] },
  { label: "3 people, 2 days, one short line", people: 3, days: 2, feet: [100] },
];

export default function AdminPricingPage() {
  const { getIdToken } = useAuth();
  const isOwner = useIsOwner();
  const [loaded, setLoaded] = useState<PricingSettings | null>(null);
  const [rules, setRules] = useState<RuleDraft | null>(null);
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Not signed in");
      const p = await getPricing(token);
      setLoaded(p);
      setRules(toRuleDraft(p.rules));
      setItems(p.items.map(toItemDraft));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load the price list.");
    }
  }, [getIdToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const parsed = useMemo(() => (rules ? parseRules(rules) : DEFAULT_PRICING_RULES), [rules]);
  const draftItems = (): PriceItem[] =>
    items.map((i) => {
      const t = i.price.trim().replace(/[$,\s]/g, "");
      const n = Number(t);
      return { ...i, price: t === "" || !Number.isFinite(n) ? null : n };
    });
  const dirty =
    !!loaded &&
    !!rules &&
    JSON.stringify({ r: parsed, i: draftItems() }) !== JSON.stringify({ r: loaded.rules, i: loaded.items });

  const save = async () => {
    if (!rules || !loaded) return;
    setError("");
    setNote("");
    const bad = items.find((i) => i.price.trim() && !Number.isFinite(Number(i.price.replace(/[$,\s]/g, ""))));
    if (bad) {
      setError(`The price for ${bad.name || "an item"} isn't a number.`);
      return;
    }
    setSaving(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Not signed in");
      const r = await savePricing({ rules: parsed, items: draftItems(), baseUpdatedAt: loaded.updatedAt }, token);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setLoaded(r.settings);
      setRules(toRuleDraft(r.settings.rules));
      setItems(r.settings.items.map(toItemDraft));
      setNote("Saved. New quotes use these numbers now.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const patchItem = (id: string, patch: Partial<ItemDraft>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const addItem = () =>
    setItems((prev) => [
      ...prev,
      { id: `item-${Date.now().toString(36)}`, name: "", kind: "work", unit: "each", price: "", active: true },
    ]);

  const inputCls =
    "px-2 py-1.5 bg-background border border-border rounded-md text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-70";
  const ro = !isOwner;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/quotes" className="text-muted-foreground hover:text-foreground" aria-label="Back to quotes">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Tags className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold mr-auto">Price rules &amp; price list</h1>
        {ro ? (
          <OwnerOnlyNote>Only an owner can change these</OwnerOnlyNote>
        ) : (
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="px-4 py-2 min-h-11 sm:min-h-0 bg-primary text-primary-foreground rounded-md text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Internal numbers for the quote builder. Customers never see this page. Labor is the higher of the crew price
        and the footage price; materials are separate lines and taxed.
      </p>
      {(error || note || loadError) && (
        <p role={error || loadError ? "alert" : "status"} className={cn("text-sm", error || loadError ? "text-destructive" : "text-muted-foreground")}>
          {error || loadError || note}
        </p>
      )}
      {dirty && !saving && <p className="text-xs text-secondary">Unsaved changes</p>}

      {!rules ? (
        !loadError && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        )
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Labor rules</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {RULE_FIELDS.map((f) => (
                <label key={f.key} className="bg-muted rounded-md p-3 space-y-1 block">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">{f.label}</span>
                  <span className="flex items-center gap-1.5">
                    {f.prefix && <span className="text-muted-foreground">{f.prefix}</span>}
                    <input
                      type="text"
                      inputMode="decimal"
                      value={rules[f.key]}
                      disabled={ro}
                      onChange={(e) => setRules({ ...rules, [f.key]: e.target.value })}
                      className={cn(inputCls, "w-24 text-right font-semibold")}
                    />
                    {f.suffix && <span className="text-xs text-muted-foreground">{f.suffix}</span>}
                  </span>
                  <span className="block text-[11px] text-muted-foreground leading-tight">{f.hint}</span>
                </label>
              ))}
            </div>
            <div className="rounded-md border border-border p-3 text-sm space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">With these numbers</p>
              {EXAMPLES.map((ex) => {
                const r = quoteRules({ people: ex.people, days: ex.days, lines: ex.feet.map((feet) => ({ feet })) }, parsed);
                return (
                  <div key={ex.label} className="flex flex-wrap justify-between gap-x-3">
                    <span>{ex.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      crew {money(r.byCrew.total)} vs footage {money(r.byFootage.total)} →{" "}
                      <strong className="text-foreground">{money(r.labor)}</strong>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Price list</h2>
            <p className="text-sm text-muted-foreground">
              Items the quote builder&apos;s Add item list offers. Leave a price blank when it changes job to job: the
              estimator has to fill it in on the quote. The QuickBooks item name is optional.
            </p>
            <div className="space-y-2">
              <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_100px_80px_90px_150px_60px_32px] gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                <span>Name</span>
                <span>Type</span>
                <span>Unit</span>
                <span className="text-right">Price</span>
                <span>QuickBooks item</span>
                <span>Active</span>
                <span />
              </div>
              {items.map((i) => (
                <div
                  key={i.id}
                  className={cn(
                    "grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_100px_80px_90px_150px_60px_32px] gap-2 items-center border-b border-border pb-2 sm:border-0 sm:pb-0",
                    !i.active && "opacity-60"
                  )}
                >
                  <input
                    value={i.name}
                    disabled={ro}
                    onChange={(e) => patchItem(i.id, { name: e.target.value })}
                    placeholder="Item name"
                    className={cn(inputCls, "col-span-2 sm:col-span-1")}
                    aria-label="Item name"
                  />
                  <select
                    value={i.kind}
                    disabled={ro}
                    onChange={(e) => patchItem(i.id, { kind: e.target.value as PriceItem["kind"] })}
                    className={inputCls}
                    aria-label="Type"
                  >
                    <option value="work">Work</option>
                    <option value="material">Material</option>
                  </select>
                  <select
                    value={i.unit}
                    disabled={ro}
                    onChange={(e) => patchItem(i.id, { unit: e.target.value as PriceItem["unit"] })}
                    className={inputCls}
                    aria-label="Unit"
                  >
                    {PRICE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u === "lump" ? "lump sum" : `per ${u}`}
                      </option>
                    ))}
                  </select>
                  <input
                    value={i.price}
                    disabled={ro}
                    inputMode="decimal"
                    onChange={(e) => patchItem(i.id, { price: e.target.value })}
                    placeholder="Each job"
                    className={cn(inputCls, "text-right")}
                    aria-label="Price"
                  />
                  <input
                    value={i.qboItem ?? ""}
                    disabled={ro}
                    onChange={(e) => patchItem(i.id, { qboItem: e.target.value })}
                    placeholder="e.g. Conduit:2in"
                    className={inputCls}
                    aria-label="QuickBooks item"
                  />
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={i.active}
                      disabled={ro}
                      onChange={(e) => patchItem(i.id, { active: e.target.checked })}
                    />
                    <span className="sm:hidden">Active</span>
                  </label>
                  {!ro && (
                    <button
                      type="button"
                      onClick={() => setItems((prev) => prev.filter((x) => x.id !== i.id))}
                      aria-label={`Remove ${i.name || "item"}`}
                      className="justify-self-end text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {!ro && (
                <button
                  type="button"
                  onClick={addItem}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-border rounded-md hover:border-primary hover:text-primary"
                >
                  <Plus className="h-3.5 w-3.5" /> Add item
                </button>
              )}
            </div>
          </section>
          {loaded?.updatedAt && (
            <p className="text-xs text-muted-foreground">
              Last saved {new Date(loaded.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              {loaded.updatedBy ? ` by ${loaded.updatedBy}` : ""}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
