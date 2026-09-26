import Image from "next/image";
import { money } from "@/lib/proposal";
import type { Proposal } from "@/lib/types";
import { ProposalMap } from "./proposal-map";

// The map, plan sheet, price table and totals on the customer's quote. No
// hooks, no directive: rendered by the server page, and by the office's
// preview of an archived acceptance (a client component).

export function ProposalDrawings({ annotation, planImageUrl }: Pick<Proposal, "annotation" | "planImageUrl">) {
  return (
    <>
      {annotation && (
        <section className="mt-6">
          <ProposalMap annotation={annotation} />
          <p className="text-xs text-black/50 mt-2">
            Map drawn from satellite imagery. Final path may shift to avoid what we find when we locate.
          </p>
        </section>
      )}

      {planImageUrl && (
        <section className="mt-6">
          <Image
            src={planImageUrl}
            alt="Plan sheet for the bore"
            width={1870}
            height={1210}
            className="w-full h-auto rounded border border-black/10"
          />
          <p className="text-xs text-black/50 mt-2">Bore plan.</p>
        </section>
      )}
    </>
  );
}

export function ProposalPrice({ lines, totals }: Pick<Proposal, "lines" | "totals">) {
  const work = lines.filter((l) => l.kind !== "material");
  const materials = lines.filter((l) => l.kind === "material");
  return (
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
              {l.qty * l.unitPrice > 0 ? (
                <>
                  <td className="py-2 text-right tabular-nums">{l.qty}</td>
                  <td className="py-2 text-right tabular-nums">{money(l.unitPrice)}</td>
                  <td className="py-2 text-right tabular-nums">{money(l.qty * l.unitPrice)}</td>
                </>
              ) : (
                <td colSpan={3} className="py-2 text-right text-black/60">Included</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 ml-auto max-w-xs text-sm space-y-1 tabular-nums">
        <div className="flex justify-between"><span className="text-black/60">Work</span><span>{money(totals.work)}</span></div>
        {totals.materials > 0 && (
          <>
            <div className="flex justify-between"><span className="text-black/60">Materials</span><span>{money(totals.materials)}</span></div>
            <div className="flex justify-between"><span className="text-black/60">Sales tax (6% on materials)</span><span>{money(totals.tax)}</span></div>
          </>
        )}
        <div className="flex justify-between border-t border-black/20 pt-2 text-lg font-bold">
          <span>Total</span><span className="text-[#E8672A]">{money(totals.total)}</span>
        </div>
      </div>
    </section>
  );
}
