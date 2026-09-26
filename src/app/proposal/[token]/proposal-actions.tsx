"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Loader2, Printer, RotateCw } from "lucide-react";
import { formatCustomerDate } from "@/lib/proposal";
import { DECLINE_CONSENT_TEXT, fingerprint, SIGNATURE_NOTICE } from "@/lib/proposal-consent";
import { signedInIdToken } from "@/lib/signed-in-token";

const CHANGED = "This quote changed. Reload to see the current one.";

export function ProposalActions({
  token,
  status: initialStatus,
  acceptedName,
  acceptedAt,
  shown,
}: {
  token: string;
  status: string;
  acceptedName?: string;
  acceptedAt?: string;
  /**
   * What this page shows, posted back with Accept or Decline: the server
   * refuses if the stored quote no longer matches. consentText is the exact
   * label next to the "I agree" box.
   */
  shown: { version: number; total: number; contentHash: string; consentText: string };
}) {
  const [status, setStatus] = useState(initialStatus);
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signedName, setSignedName] = useState(acceptedName || "");
  const [signedAt, setSignedAt] = useState(acceptedAt || "");

  // Count a view only when a real browser renders the page. If someone from
  // the office is signed in here, their ID token goes along and the server
  // doesn't count it; "?preview=1" alone does not skip the count.
  useEffect(() => {
    let live = true;
    (async () => {
      const auth = await signedInIdToken();
      if (!live) return;
      fetch(`/api/proposals/${token}/view`, {
        method: "POST",
        headers: auth ? { Authorization: `Bearer ${auth}` } : {},
      }).catch(() => {});
    })();
    return () => {
      live = false;
    };
  }, [token]);

  const respond = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/proposals/${token}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, version: shown.version, total: shown.total, contentHash: shown.contentHash }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Something went wrong.");
      setStatus(json.status);
      if (body.action === "accept") {
        setSignedName(String(json.acceptedName || body.name));
        setSignedAt(String(json.acceptedAt || new Date().toISOString()));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const open = status === "sent" || status === "viewed";
  const print = fingerprint(shown.contentHash);
  const errorBlock = error && (
    <div role="alert" className="text-sm text-red-700 space-y-2">
      <p>{error}</p>
      {error === CHANGED && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-lg border border-red-300 text-red-800 flex items-center gap-1.5"
        >
          <RotateCw className="h-4 w-4" /> Reload
        </button>
      )}
    </div>
  );

  return (
    <section className="mt-10 border-t-2 border-black/10 pt-6 print:break-inside-avoid">
      {status === "accepted" && (
        <div className="rounded-lg bg-green-50 border border-green-300 p-5">
          <p className="flex items-center gap-2 font-semibold text-green-800">
            <CheckCircle className="h-5 w-5" /> Accepted{signedName ? ` by ${signedName}` : ""}
            {signedAt ? ` on ${formatCustomerDate(signedAt)}` : ""}
          </p>
          <p className="text-sm mt-2 text-green-900">
            Thank you. Bill will call you to set a date. Questions before then, call or text (231) 944-6471.
          </p>
          {print && <p className="text-[11px] mt-2 text-green-900/60 font-mono">Quote fingerprint {print}</p>}
          <button
            type="button"
            onClick={() => window.print()}
            className="mt-3 px-4 py-2.5 text-sm rounded-lg border border-green-300 text-green-900 flex items-center gap-1.5 print:hidden"
          >
            <Printer className="h-4 w-4" /> Print or save PDF
          </button>
        </div>
      )}

      {status === "declined" && (
        <div className="rounded-lg bg-black/5 p-5 text-sm">
          You declined this quote. If something changes or you want a different option, call or text Bill at (231) 944-6471.
          <button type="button" onClick={() => setStatus("viewed")} className="block mt-2 underline text-black/70">
            Changed your mind? You can still approve it.
          </button>
        </div>
      )}

      {open && !declining && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold">Ready to go?</h2>
          <div className="space-y-1.5">
            <label htmlFor="sig" className="text-sm font-medium">Type your full name to approve</label>
            <input
              id="sig"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="w-full sm:max-w-sm px-3 py-2.5 border border-black/20 rounded-md text-base focus:outline-none focus:ring-2 focus:ring-[#E8672A]"
            />
          </div>
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5" />
            <span>{shown.consentText}</span>
          </label>
          {errorBlock}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => respond({ action: "accept", name, agree, consentText: shown.consentText })}
              disabled={busy || name.trim().length < 2 || !agree}
              className="px-6 py-3 rounded-lg bg-[#E8672A] text-white font-semibold disabled:opacity-40 flex items-center gap-2"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Approve quote
            </button>
            <button onClick={() => setDeclining(true)} className="px-4 py-3 text-sm text-black/60 underline">
              No thanks
            </button>
            <button onClick={() => window.print()} className="px-4 py-3 text-sm text-black/60 flex items-center gap-1.5 print:hidden">
              <Printer className="h-4 w-4" /> Print or save PDF
            </button>
          </div>
          <p className="text-xs text-black/50">
            {SIGNATURE_NOTICE}
          </p>
        </div>
      )}

      {open && declining && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold">No problem</h2>
          <label htmlFor="why" className="text-sm">Mind telling us why? (optional)</label>
          <textarea
            id="why"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full sm:max-w-lg px-3 py-2 border border-black/20 rounded-md text-base"
          />
          {errorBlock}
          <div className="flex gap-3">
            <button
              onClick={() => respond({ action: "decline", reason, consentText: DECLINE_CONSENT_TEXT })}
              disabled={busy}
              className="px-5 py-2.5 rounded-lg bg-black/80 text-white font-medium disabled:opacity-40"
            >
              {DECLINE_CONSENT_TEXT}
            </button>
            <button onClick={() => setDeclining(false)} className="px-4 py-2.5 text-sm underline text-black/60">
              Go back
            </button>
          </div>
        </div>
      )}

      {!open && status !== "accepted" && (
        <button
          type="button"
          onClick={() => window.print()}
          className="mt-4 px-4 py-2.5 text-sm text-black/60 flex items-center gap-1.5 print:hidden"
        >
          <Printer className="h-4 w-4" /> Print or save PDF
        </button>
      )}
    </section>
  );
}
