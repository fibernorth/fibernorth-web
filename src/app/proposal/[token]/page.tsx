import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { loadProposal, isExpired } from "@/lib/proposal-server";
import { formatCustomerDate, goodThroughText } from "@/lib/proposal";
import { shownHash } from "@/lib/proposal-evidence";
import { acceptConsentText, isArchivedAcceptance } from "@/lib/proposal-consent";
import { getVisibleTestimonials } from "@/lib/server-data";
import type { Testimonial } from "@/lib/types";
import { ProposalActions } from "./proposal-actions";
import { ProposalDrawings, ProposalPrice } from "./proposal-details";
import { ArchivedPreview } from "./archived-preview";

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
  // The office's "See what the customer sees" link. It no longer decides
  // view tracking (the view beacon checks for an admin sign-in instead); it
  // only lets a signed-in admin see an archived acceptance's details.
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
  // Six months after acceptance the link stops showing the map, prices and
  // address (anyone holding an old forwarded email could otherwise see them).
  const archived = isArchivedAcceptance(p);
  // What the page shows, fingerprinted; posted back with Accept/Decline and
  // checked against the stored copy.
  const contentHash = shownHash(p);

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
            {p.customer.address && !archived && <p>{p.customer.address}</p>}
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

        {archived ? (
          <>
            <div className="mt-6 rounded-lg bg-black/5 border border-black/10 p-4 text-sm">
              This quote was accepted on {formatCustomerDate(p.acceptedAt || "")}. Contact us for a copy: call or text
              Bill at (231) 944-6471.
            </div>
            {preview && <ArchivedPreview token={token} />}
          </>
        ) : (
          <>
            <ProposalDrawings annotation={p.annotation} planImageUrl={p.planImageUrl} />
            <ProposalPrice lines={p.lines} totals={p.totals} />
          </>
        )}

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
          shown={{
            version: p.version,
            total: p.totals.total,
            contentHash,
            consentText: acceptConsentText(p.totals.total),
          }}
        />
      </div>
      <p className="text-center text-xs text-black/40 mt-6 print:hidden">FiberNorth Underground · Williamsburg, Michigan · fibernorth.com</p>
    </main>
  );
}
