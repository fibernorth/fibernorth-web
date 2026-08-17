import { Metadata } from "next";
import Link from "next/link";
import { Phone } from "lucide-react";

export const metadata: Metadata = {
  title: "FAQ: Cost, Depth, MISS DIG & What to Expect",
  description:
    "What it costs to bury a line, how deep lines go in Michigan, whether boring tears up the yard, MISS DIG rules, pipe sizes up to 10 inches, and our 80-mile service area. Straight answers, free estimates.",
  keywords: [
    "cost to bury a line",
    "how deep are water lines buried in Michigan",
    "does directional boring damage the yard",
    "MISS DIG requirements",
    "bore under driveway",
    "Northern Michigan",
  ],
};

const faqs = [
  {
    id: "cost",
    question: "How much does it cost to bury a water or power line?",
    answer: [
      "A typical 100-foot bore runs $3,000, done in a day or less. That one number covers the whole job: drilling the path, pulling your pipe or conduit through, and cleanup. There's no restoration bill afterward because nothing gets torn up.",
      "An open trench might quote cheap, but once you add obstacle detours, driveway cuts, sprinkler repairs, backfill, topsoil, and seed, a 100-foot trench realistically lands between $2,300 and $6,000. Then you water dirt all summer.",
      "Every property is different, which is why estimates are free.",
    ],
    cta: "Get a free quote for your run",
  },
  {
    id: "depth",
    question: "How deep are lines buried in Michigan?",
    answer: [
      "It depends on what's in the pipe. Water lines have to sit below the frost line, and up here that's serious: figure around 42 inches minimum in Northern Michigan, with many local codes calling for 48 inches or more. Your local building department has the final word. Electrical is usually shallower, commonly 18 to 24 inches depending on whether it's in conduit, per code and your inspector.",
      "A deeper trench means a wider cut, more spoil, and more money. A deeper bore costs about the same as a shallow one. Frost depth doesn't scare us.",
    ],
    cta: "Ask us about depth for your project",
  },
  {
    id: "yard-damage",
    question: "Does boring damage the yard?",
    answer: [
      "No. The only digging is two small pits, one where the drill enters and one where it exits. Everything in between stays exactly as it is: lawn, trees, flower beds, irrigation. We fill the pits before we leave.",
      "Our standard is simple. Your lawn looks like we were never there.",
    ],
    cta: "See what your job would look like",
  },
  {
    id: "miss-dig",
    question: "Do I need to call MISS DIG?",
    answer: [
      "Yes — Michigan law requires existing utilities to be marked before any digging or boring. MISS DIG is free, and we handle the coordination as part of the job. Marking usually takes about 3 business days, and we schedule your bore right behind it.",
      "If we need to expose an existing utility to bore past it safely, our hydrovac truck does that without a shovel touching your lawn.",
    ],
    cta: "Start the process with a free estimate",
  },
  {
    id: "how-long",
    question: "How long does the work take?",
    answer: [
      "Most jobs are done in a day or less. We show up in the morning, dig the two pits, bore the path, pull your line through, clean up, and go home. Mow that evening if you feel like it.",
      "Scheduling is quick too. We're usually on site within 3 days of your call, once MISS DIG marking is complete.",
    ],
    cta: "Get on the schedule",
  },
  {
    id: "obstacles",
    question: "Can you go under a driveway, septic field, or trees?",
    answer: [
      "Yes. That's the whole reason directional boring exists. The drill head travels underneath driveways, sidewalks, mature tree roots, septic tanks and drain fields, decks, and landscaping in a straight line from pit to pit.",
      "A trench has to go around those things or through them. We just go under.",
    ],
    cta: "Tell us what's in the way",
  },
  {
    id: "pipe-size",
    question: "What size pipe can you install?",
    answer: [
      "We pull product up to 10 inches in diameter, from a half-inch water service up to irrigation mains and large casings. We run five directional drills, so there's a right-size machine for a backyard water line or a long commercial run.",
      "Not sure what size you need? Describe the job and we'll tell you.",
    ],
    cta: "Describe your job",
  },
  {
    id: "service-area",
    question: "What area do you serve?",
    answer: [
      "We work within about 80 miles of Williamsburg, MI. That covers Traverse City, Petoskey, Charlevoix, Gaylord, Grayling, Cadillac, Kalkaska, and the Leelanau Peninsula, plus everywhere in between.",
      "On the edge of that circle? Call anyway. Worst case, we point you in the right direction.",
    ],
    cta: "Check if we cover your address",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: f.answer.join(" "),
    },
  })),
};

export default function FaqPage() {
  return (
    <div className="py-16 sm:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="text-center mb-14">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            Straight Answers About{" "}
            <span className="text-primary">Burying a Line</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Cost, depth, MISS DIG, driveways, scheduling. If your question
            isn&apos;t here, call{" "}
            <a
              href="tel:+12312640757"
              className="text-primary hover:underline whitespace-nowrap"
            >
              (231) 264-0757
            </a>{" "}
            and ask a person.
          </p>
        </div>

        {/* Questions */}
        <div className="space-y-6">
          {faqs.map((faq) => (
            <section
              key={faq.id}
              id={faq.id}
              className="bg-card border border-border rounded-lg p-6 sm:p-8 scroll-mt-24"
            >
              <h2 className="text-xl sm:text-2xl font-bold mb-4">
                {faq.question}
              </h2>
              {faq.answer.map((para, i) => (
                <p
                  key={i}
                  className={`text-muted-foreground ${i > 0 ? "mt-3" : ""}`}
                >
                  {para}
                </p>
              ))}
              <p className="mt-4">
                <Link
                  href="/contact"
                  className="text-primary font-semibold hover:underline"
                >
                  {faq.cta} &rarr;
                </Link>
              </p>
            </section>
          ))}
        </div>

        {/* CTA */}
        <section className="mt-14 text-center bg-card border border-border rounded-lg p-10">
          <h2 className="text-2xl font-bold">Ready for a Real Number?</h2>
          <p className="mt-2 text-muted-foreground">
            Free estimates, no obligation. We&apos;ll look at your run and tell
            you exactly what it takes.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/contact"
              className="inline-block px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 transition-colors"
            >
              Get a Free Quote
            </Link>
            <a
              href="tel:+12312640757"
              className="inline-flex items-center gap-2 px-8 py-3 border border-border font-semibold rounded-md hover:bg-card transition-colors"
            >
              <Phone className="h-4 w-4" />
              (231) 264-0757
            </a>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Want the full cost breakdown first? See{" "}
            <Link href="/why-trenchless" className="text-primary hover:underline">
              trenching vs. boring, side by side
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
