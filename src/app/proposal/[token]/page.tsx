import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { loadProposal, isExpired } from "@/lib/proposal-server";
import { formatCustomerDate, goodThroughText, money } from "@/lib/proposal";
import { getVisibleTestimonials } from "@/lib/server-data";
import type { Testimonial } from "@/lib/types";
import { ProposalActions } from "./proposal-actions";
import { ProposalMap } from "./proposal-map";

// Customer-facing proposal. The token in the URL is the only key. Shows the
// frozen snapshot that was sent: never the rate sheet or internal notes.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your quote",
  robots: { index: false, follow: false },
};

/**
 * One finished-job photo, reused from /why-trenchless (a real FiberNorth
 * water line job). Set to null to drop it.
 */
const JOB_PHOTO: { src: string; alt: string; caption: string } | null = {
  src: "/images/jobs/waterline-hillside-landscaping.jpg",
  alt: "Wooded hillside with the landscaping intact after a water line was bored underneath",
  caption: "A water line bored under this hillside. The plantings, the boulder and the ground cover stayed put.",
};

/**
 * Up to 3 reviews from the site's testimonials (Admin -> Testimonials,
 * visible ones only): 4 stars and up, best first, then newest. None on file
 * means no reviews block.
 */
function pickReviews(all: Testimonial[]): Testimonial[] {
  return all
    .filter((t) => (t.text || "").trim() && Number(t.rating) >= 4)
    .sort((a, b) => Number(b.rating) - Number(a.rating) || String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 3);
}

export default async function ProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  // The office's "See what the customer sees" link: don't count it as a view.
  const preview = (await searchParams).preview === "1";
  const p = await loadProposal(token);
  if (!p) notFound();

  const expired = isExpired(p);
  const status = expired ? "expired" : p.status;
  const goodThrough = goodThroughText(p);

  if (status === "void") {
    return (
      <main className="min-h-screen bg-[#f6f5f2] text-[#1b1b1b] py-8 px-4">
        <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-black/10 p-6 sm:p-10">
          <Image src="/logo/fibernorth-logo-light.png" alt="FiberNorth Underground" width={190} height={71} priority />
          <p className="mt-6 rounded-lg bg-amber-50 border border-amber-300 p-4 text-sm">
            This quote is no longer available. Call or text Bill at (231) 944-6471 and he will sort it out with you.
          </p>
        </div>
      </main>
    );
  }
  const reviews = pickReviews(await getVisibleTestimonials());
  const work = p.lines.filter((l) => l.kind !== "material");
  const materials = p.lines.filter((l) => l.kind === "material");

  return (
    <main className="min-h-screen bg-[#f6f5f2] text-[#1b1b1b] py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-black/10 p-6 sm:p-10 print:shadow-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#E8672A] pb-4">
          <Image src="/logo/fibernorth-logo-light.png" alt="FiberNorth Underground" width={190} height={71} priority />
          <div className="text-sm text-right text-black/70 leading-snug">
            <p className="font-semibold text-black">Quote{p.version > 1 ? ` (revision ${p.version})` : ""}</p>
            <p>Sent {formatCustomerDate(p.sentAt)}</p>
            {goodThrough && <p>Good through {goodThrough}</p>}
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
            This quote was good through {goodThrough}. Call or text Bill at (231) 944-6471 and we will refresh it.
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
            <p>(231) 944-6471 · bill@fibernorth.com</p>
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

        {p.planImageUrl && (
          <section className="mt-6">
            <Image
              src={p.planImageUrl}
              alt="Plan sheet for the bore"
              width={1870}
              height={1210}
              className="w-full h-auto rounded border border-black/10"
            />
            <p className="text-xs text-black/50 mt-2">Bore plan.</p>
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

        {status !== "superseded" && (reviews.length > 0 || JOB_PHOTO) && (
          <section className="mt-8 print:hidden">
            <h2 className="text-lg font-bold">From jobs we&apos;ve done</h2>
            {JOB_PHOTO && (
              <figure className="mt-3">
                <Image
                  src={JOB_PHOTO.src}
                  alt={JOB_PHOTO.alt}
                  width={1205}
                  height={1600}
                  sizes="(max-width: 640px) 100vw, 360px"
                  className="w-full sm:w-2/3 h-auto rounded border border-black/10"
                />
                <figcaption className="text-xs text-black/60 mt-2">{JOB_PHOTO.caption}</figcaption>
              </figure>
            )}
            {reviews.length > 0 && (
              <ul className="mt-4 grid sm:grid-cols-2 gap-3">
                {reviews.map((r) => (
                  <li key={r.id} className="rounded-lg border border-black/10 bg-[#f6f5f2] p-4 text-sm">
                    <p className="text-[#F4A42B]" aria-label={`${r.rating} out of 5 stars`}>
                      {"★".repeat(Math.max(0, Math.min(5, Math.round(r.rating))))}
                    </p>
                    <p className="mt-1 leading-relaxed">&ldquo;{r.text}&rdquo;</p>
                    <p className="mt-2 text-black/60">
                      {r.name}
                      {r.location ? `, ${r.location}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-lg font-bold">Terms</h2>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed list-disc pl-5 text-black/80">
            {p.terms.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </section>

        {(status === "sent" || status === "viewed" || status === "accepted") && (
          <section className="mt-8 print:break-inside-avoid">
            <h2 className="text-lg font-bold">What happens next</h2>
            <ol className="mt-2 space-y-2 text-sm leading-relaxed list-decimal pl-5 text-black/80">
              <li>Bill calls you to set a date.</li>
              <li>
                We call in MISS DIG to mark the public lines, which takes about three working days. Show us any
                private lines you know about, like sprinklers or a line to the barn, and we locate those too.
              </li>
              <li>Most jobs are one day on site. If yours will take longer, we&apos;ll tell you when we set the date.</li>
              <li>We backfill the pits, bring them back to grade with topsoil and seed, and clean up before we leave.</li>
            </ol>
          </section>
        )}

        <ProposalActions
          token={token}
          status={status}
          acceptedName={p.acceptedName}
          acceptedAt={p.acceptedAt}
          total={money(p.totals.total)}
          preview={preview}
        />
      </div>
      <p className="text-center text-xs text-black/40 mt-6 print:hidden">FiberNorth Underground · Williamsburg, Michigan · fibernorth.com</p>
    </main>
  );
}
