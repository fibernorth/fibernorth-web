import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { loadProposal, isExpired } from "@/lib/proposal-server";
import { money } from "@/lib/proposal";
import { ProposalActions } from "./proposal-actions";
import { ProposalMap } from "./proposal-map";

// Customer-facing proposal. The token in the URL is the only key. Shows the
// frozen snapshot that was sent: never the rate sheet or internal notes.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your quote",
  robots: { index: false, follow: false },
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export default async function ProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await loadProposal(token);
  if (!p) notFound();

  const expired = isExpired(p);
  const status = expired ? "expired" : p.status;
  const work = p.lines.filter((l) => l.kind !== "material");
  const materials = p.lines.filter((l) => l.kind === "material");

  return (
    <main className="min-h-screen bg-[#f6f5f2] text-[#1b1b1b] py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-black/10 p-6 sm:p-10 print:shadow-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#E8672A] pb-4">
          <Image src="/logo/fibernorth-logo-light.png" alt="FiberNorth Underground" width={190} height={71} priority />
          <div className="text-sm text-right text-black/70 leading-snug">
            <p className="font-semibold text-black">Quote{p.version > 1 ? ` (revision ${p.version})` : ""}</p>
            <p>Sent {fmtDate(p.sentAt)}</p>
            <p>Good through {fmtDate(p.expiresAt)}</p>
          </div>
        </header>

        {status === "superseded" && (
          <div className="mt-6 rounded-lg bg-amber-50 border border-amber-300 p-4 text-sm">
            This quote was replaced by a newer version.{" "}
            {p.supersededBy && (
              <a href={`/proposal/${p.supersededBy}`} className="font-semibold text-[#E8672A] underline">
                Open the latest quote
              </a>
            )}
          </div>
        )}
        {status === "expired" && (
          <div className="mt-6 rounded-lg bg-amber-50 border border-amber-300 p-4 text-sm">
            This quote expired on {fmtDate(p.expiresAt)}. Call or text Bill at (231) 944-6471 and we will refresh it.
          </div>
        )}

        <section className="mt-6 grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wider text-black/50">Prepared for</p>
            <p className="font-semibold">{p.customer.name}</p>
            {p.customer.address && <p>{p.customer.address}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-xs uppercase tracking-wider text-black/50">From</p>
            <p className="font-semibold">Bill Gaylord, FiberNorth Underground</p>
            <p>Williamsburg, Michigan</p>
            <p>(231) 944-6471 · bill@fibernorth.net</p>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-bold">The work</h2>
          <p className="mt-2 leading-relaxed">{p.scopeText}</p>
        </section>

        {p.annotation && (
          <section className="mt-6">
            <ProposalMap annotation={p.annotation} />
            <p className="text-xs text-black/50 mt-2">
              Map drawn from satellite imagery. Final path may shift to avoid what we find when we locate.
            </p>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-lg font-bold">Price</h2>
          <table className="w-full mt-3 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-black/50 border-b">
                <th className="py-2 font-medium">Item</th>
                <th className="py-2 font-medium text-right w-16">Qty</th>
                <th className="py-2 font-medium text-right w-28">Each</th>
                <th className="py-2 font-medium text-right w-28">Amount</th>
              </tr>
            </thead>
            <tbody>
              {[...work, ...materials].map((l, i) => (
                <tr key={i} className="border-b border-black/5">
                  <td className="py-2 pr-2">
                    {l.description || (l.kind === "material" ? "Materials" : "Work")}
                    {l.kind === "material" && <span className="text-black/40 text-xs"> (material)</span>}
                  </td>
                  <td className="py-2 text-right tabular-nums">{l.qty}</td>
                  <td className="py-2 text-right tabular-nums">{money(l.unitPrice)}</td>
                  <td className="py-2 text-right tabular-nums">{money(l.qty * l.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 ml-auto max-w-xs text-sm space-y-1 tabular-nums">
            <div className="flex justify-between"><span className="text-black/60">Work</span><span>{money(p.totals.work)}</span></div>
            {p.totals.materials > 0 && (
              <>
                <div className="flex justify-between"><span className="text-black/60">Materials</span><span>{money(p.totals.materials)}</span></div>
                <div className="flex justify-between"><span className="text-black/60">Sales tax (6% on materials)</span><span>{money(p.totals.tax)}</span></div>
              </>
            )}
            <div className="flex justify-between border-t border-black/20 pt-2 text-lg font-bold">
              <span>Total</span><span className="text-[#E8672A]">{money(p.totals.total)}</span>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-bold">The fine print</h2>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed list-disc pl-5 text-black/80">
            {p.terms.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </section>

        <ProposalActions
          token={token}
          status={status}
          acceptedName={p.acceptedName}
          acceptedAt={p.acceptedAt}
          total={money(p.totals.total)}
        />
      </div>
      <p className="text-center text-xs text-black/40 mt-6 print:hidden">FiberNorth Underground · Williamsburg, Michigan · fibernorth.com</p>
    </main>
  );
}
