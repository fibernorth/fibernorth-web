"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/context/auth-provider";
import { listFailedNotices, markNoticeHandled, type FailedNotice } from "@/actions/notices";

const REFRESH_MS = 2 * 60_000;

const KIND_LABEL: Record<string, string> = {
  accepted: "Quote accepted",
  declined: "Quote declined",
  viewed: "Quote opened",
  "customer-copy": "Customer's acceptance copy",
  "quote-form": "Website quote request",
  "quote-form-confirmation": "Quote request confirmation to the customer",
  application: "Job application",
  "application-confirmation": "Application confirmation to the applicant",
};

/**
 * Red banner listing notices that didn't get through (the office wasn't
 * emailed or Slacked, or a customer didn't get their copy). Nothing shows
 * when there are none, or when the list can't be read.
 */
export function FailedNotices() {
  const { getIdToken } = useAuth();
  const [items, setItems] = useState<FailedNotice[]>([]);

  const load = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      setItems(await listFailedNotices(token));
    } catch {
      /* the banner is a helper; never break the page over it */
    }
  }, [getIdToken]);

  useEffect(() => {
    void load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  if (!items.length) return null;

  const handled = async (id: string) => {
    try {
      const token = await getIdToken();
      if (!token) return;
      await markNoticeHandled(id, token);
      setItems((xs) => xs.filter((x) => x.id !== id));
    } catch {
      /* stays listed; try again */
    }
  };

  return (
    <section role="alert" className="rounded-lg border border-destructive/60 bg-destructive/10 p-3 sm:p-4 space-y-2">
      <p className="flex items-center gap-2 font-semibold text-destructive">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        {items.length === 1 ? "A notice didn't get through" : `${items.length} notices didn't get through`}
      </p>
      <ul className="space-y-2 text-sm">
        {items.map((n) => (
          <li key={n.id} className="flex flex-wrap items-start gap-x-3 gap-y-1">
            <span className="flex-1 min-w-[14rem]">
              <span className="font-medium">{KIND_LABEL[n.kind] ?? n.kind}</span>
              {n.summary ? `: ${n.summary}` : ""}
              {n.error && <span className="block text-xs text-muted-foreground">{n.error}</span>}
            </span>
            {n.lead && (
              <Link href={`/admin/leads?lead=${encodeURIComponent(n.lead)}`} className="text-primary underline text-sm">
                Open lead
              </Link>
            )}
            {!n.lead && n.application && (
              <Link href="/admin/applications" className="text-primary underline text-sm">
                Applications
              </Link>
            )}
            <button type="button" onClick={() => handled(n.id)} className="text-sm underline text-muted-foreground">
              Mark handled
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
