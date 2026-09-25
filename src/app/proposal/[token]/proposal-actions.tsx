"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Loader2, Printer } from "lucide-react";

export function ProposalActions({
  token,
  status: initialStatus,
  acceptedName,
  acceptedAt,
  total,
  version,
  sentOn,
}: {
  token: string;
  status: string;
  acceptedName?: string;
  acceptedAt?: string;
  total: string;
  version: number;
  sentOn: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [latest, setLatest] = useState("");
  const [signedName, setSignedName] = useState(acceptedName || "");
  const which = version > 1 ? `revision ${version}, sent ${sentOn}` : `the quote sent ${sentOn}`;

  // Count a view only when a real browser renders the page.
  useEffect(() => {
    fetch(`/api/proposals/${token}/view`, { method: "POST" }).catch(() => {});
  }, [token]);

  const respond = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/proposals/${token}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The quote changed while this page was open: point at the new one.
        if (json.latest) setLatest(String(json.latest));
        throw new Error(json.error || "Something went wrong.");
      }
      setStatus(json.status);
      if (body.action === "accept") setSignedName(String(body.name));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const open = status === "sent" || status === "viewed";

  return (
    <section className="mt-10 border-t-2 border-black/10 pt-6 print:break-inside-avoid">
      {status === "accepted" && (
        <div className="rounded-lg bg-green-50 border border-green-300 p-5">
          <p className="flex items-center gap-2 font-semibold text-green-800">
            <CheckCircle className="h-5 w-5" /> Accepted{signedName ? ` by ${signedName}` : ""}
            {acceptedAt ? ` on ${new Date(acceptedAt).toLocaleDateString("en-US")}` : ""}
          </p>
          <p className="text-sm mt-1 text-green-900">
            {version > 1 ? `Revision ${version}` : "The quote"} sent {sentOn}, {total}.
          </p>
          <p className="text-sm mt-2 text-green-900">
            Thank you. Bill will call you to set a date. Questions before then, call or text (231) 944-6471.
          </p>
        </div>
      )}

      {status === "declined" && (
        <div className="rounded-lg bg-black/5 p-5 text-sm">
          You declined this quote. If something changes or you want a different option, call or text Bill at (231) 944-6471.
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
            <span>I approve {which}, for {total}, and agree to the terms above.</span>
          </label>
          {error && (
            <p className="text-sm text-red-700">
              {error}
              {latest && (
                <>
                  {" "}
                  <a href={`/proposal/${latest}`} className="font-semibold underline">Open the latest quote</a>
                </>
              )}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => respond({ action: "accept", name, agree })}
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
            Typing your name and checking the box is your signature. We keep a record of when you approved.
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
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => respond({ action: "decline", reason })}
              disabled={busy}
              className="px-5 py-2.5 rounded-lg bg-black/80 text-white font-medium disabled:opacity-40"
            >
              Decline quote
            </button>
            <button onClick={() => setDeclining(false)} className="px-4 py-2.5 text-sm underline text-black/60">
              Go back
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
