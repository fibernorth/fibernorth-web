import { jsonLdScript } from "@/lib/json-ld";
import { Metadata } from "next";
import Link from "next/link";
import { COMPANY, SERVICE_COUNTIES } from "@/lib/constants";
import { ArrowRight, Check, Phone, X } from "lucide-react";

const PAGE_URL = "https://fibernorth.com/trenching";
const SEO_TITLE = "Trenching Service Near Traverse City, MI | FiberNorth";
const META_DESCRIPTION =
  "Need a trench for a water or electric line? We bury it by directional drilling instead. No trench, no torn-up yard. $3,000 for a typical bore. (231) 264-0757.";

export const metadata: Metadata = {
  title: { absolute: SEO_TITLE },
  description: META_DESCRIPTION,
  keywords: [
    "trenching service",
    "trenching near me",
    "trenching Traverse City",
    "trench for water line",
    "trench for electric line",
    "alternative to trenching",
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: { title: SEO_TITLE, description: META_DESCRIPTION, url: PAGE_URL },
};

const tel = `tel:+1${COMPANY.phone.replace(/[^0-9]/g, "")}`;

const jobs = [
  {
    title: "Trench for a water line",
    text: "Water to a garage, pole barn, or new house. We bore it below the frost line, and a deeper bore costs about the same as a shallow one.",
    href: "/services/water-lines",
  },
  {
    title: "Trench for an electric line",
    text: "Conduit out to a shop, barn, or generator. We put the conduit in the ground and your electrician pulls the wire.",
    href: "/services/power",
  },
  {
    title: "Trench for gas or propane",
    text: "Propane and natural gas lines to the house, garage, generator, or pool heater.",
    href: "/services/gas",
  },
  {
    title: "Trench for internet cable",
    text: "Fiber or ethernet from the house out to a pole barn or office.",
    href: "/services/fiber",
  },
  {
    title: "Trench across a driveway",
    text: "We go under the driveway, sidewalk, or road. Nothing gets saw-cut or patched.",
    href: "/services/culvert-driveway",
  },
  {
    title: "Trench for septic or drainage",
    text: "Septic lines and buried downspouts, run under the lawn instead of through it.",
    href: "/services/septic",
  },
];

const compare = [
  { label: "What happens to the yard", trench: "A ditch and a dirt pile the length of the run", bore: "Two small pits, one at each end" },
  { label: "Driveways and sidewalks", trench: "Saw-cut, removed, and repoured", bore: "We go under them" },
  { label: "Restoration", trench: "Backfill, topsoil, seed, and weeks of watering", bore: "Fill two small holes" },
  { label: "Typical cost", trench: "$2,300 to $6,000 once restoration is counted", bore: "$3,000 for a bore up to 150 ft" },
  { label: "Time", trench: "Days of digging, then months of regrowth", bore: "A day or less" },
];

const faqs = [
  {
    question: "Do you do trenching?",
    answer:
      "We don't dig trenches. We put lines underground by directional drilling, which does the same job without the ditch. We dig two small pits, drill between them, and pull your pipe or conduit back through. Everything in between stays as it is.",
  },
  {
    question: "Is boring more expensive than trenching?",
    answer:
      "Often it isn't, once you count everything. A trencher quote covers the digging. Then come driveway cuts, sprinkler repairs, backfill, topsoil, and seed. A realistic trench total runs $2,300 to $6,000. A typical bore up to 150 feet is $3,000, and there's nothing to restore.",
  },
  {
    question: "How deep can you put a water or electric line?",
    answer:
      "As deep as the job needs. A water line goes below the frost line. With a trench, deeper means a wider cut and more money. With a bore, depth barely changes the price.",
  },
  {
    question: "How soon can you do it?",
    answer:
      "We usually get you on the schedule in about 3 days, after MISS DIG has marked the public utilities. Most jobs are done in a day or less.",
  },
  {
    question: "What area do you cover?",
    answer: `We're in Williamsburg, just east of Traverse City. Most of our work is in ${SERVICE_COUNTIES.slice(0, -1).join(", ")}, and ${SERVICE_COUNTIES.at(-1)} counties, and we go farther for the right job.`,
  },
];

const serviceJsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Trenchless line installation (alternative to trenching)",
  serviceType: "Directional drilling",
  description: META_DESCRIPTION,
  url: PAGE_URL,
  provider: {
    "@type": "LocalBusiness",
    name: COMPANY.name,
    url: "https://fibernorth.com",
    telephone: "+12312640757",
    address: {
      "@type": "PostalAddress",
      streetAddress: COMPANY.address,
      addressLocality: COMPANY.city,
      addressRegion: COMPANY.state,
      postalCode: COMPANY.zip,
      addressCountry: "US",
    },
  },
  areaServed: SERVICE_COUNTIES.map((c) => ({ "@type": "AdministrativeArea", name: `${c} County, MI` })),
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
};

export default function TrenchingPage() {
  return (
    <div className="py-16 sm:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(serviceJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd) }}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="max-w-3xl mb-14">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-4">
            Looking for a trenching service?
          </p>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight">
            Need a Trench Dug? We Bury the Line Without One.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
            We&apos;ll be straight with you. We don&apos;t dig trenches. If
            you need a water line, electric line, or gas line put in the
            ground, we do it by directional drilling. Two small pits, a drill
            that goes underneath, and your line gets pulled through. The lawn,
            the trees, and the driveway stay where they are.
          </p>
          <p className="mt-3 text-lg text-muted-foreground leading-relaxed">
            Once you add up what a trench costs to fix afterward, drilling
            often comes out about the same. Sometimes less.
          </p>
          <p className="mt-3 text-sm text-primary font-semibold uppercase tracking-wider">
            Typical bore up to 150 ft: $3,000, done in a day or less. Free estimates.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4">
            <Link
              href="/contact"
              className="px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors text-center"
            >
              Get a Free Quote
            </Link>
            <a
              href={tel}
              className="flex items-center justify-center gap-2 px-8 py-3 border border-border font-medium rounded-lg hover:bg-muted transition-colors"
            >
              <Phone className="h-4 w-4" />
              {COMPANY.phone}
            </a>
          </div>
        </div>

        {/* Cost math */}
        <section className="mb-14 bg-card border border-border rounded-xl p-7 sm:p-10">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">What the trench really costs</h2>
          <p className="text-muted-foreground max-w-3xl mb-6">
            The trencher quote is only the first line. After it come the
            driveway cut, the sprinkler repairs, backfill, topsoil, seed, and
            weeks of watering. For a typical 100-foot run through an
            established lawn, that lands between $2,300 and $6,000. A bore up
            to 150 feet is $3,000, and there&apos;s nothing to restore.
          </p>
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr] gap-4 p-4 bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span />
              <span>Open trench</span>
              <span>Directional drilling</span>
            </div>
            {compare.map((row) => (
              <div
                key={row.label}
                className="grid sm:grid-cols-[1fr_1fr_1fr] gap-2 sm:gap-4 p-4 border-t border-border text-sm"
              >
                <p className="font-semibold">{row.label}</p>
                <p className="flex items-start gap-2 text-muted-foreground">
                  <X className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  {row.trench}
                </p>
                <p className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                  {row.bore}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Trench figures are illustrative, based on typical Northern
            Michigan costs. Every property is different, which is why the
            estimate is free.
          </p>
          <Link
            href="/why-trenchless"
            className="mt-6 inline-flex items-center gap-2 text-primary font-semibold text-sm hover:underline"
          >
            See the full trench vs. bore breakdown
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        {/* Jobs */}
        <section className="mb-14">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">The trenches we replace</h2>
          <p className="text-muted-foreground mb-6 max-w-3xl">
            If you were going to dig a trench for it, we can usually drill it
            instead.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {jobs.map((job) => (
              <Link
                key={job.title}
                href={job.href}
                className="group bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors"
              >
                <h3 className="font-semibold mb-2">{job.title}</h3>
                <p className="text-sm text-muted-foreground">{job.text}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* How */}
        <section className="mb-14 grid md:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-xl p-7">
            <h2 className="text-xl font-bold mb-3">How we do it instead</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              MISS DIG marks the public lines and our locating specialist
              finds the private ones. We dig a small pit at each end, steer
              the drill underground from one to the other, and pull your pipe
              or conduit back through. Then we fill the pits and go home. We
              run five directional drills and our own hydrovac, so there&apos;s
              a machine sized for a backyard or a long commercial run.
            </p>
            <Link
              href="/directional-drilling"
              className="mt-5 inline-flex items-center gap-2 text-primary font-semibold text-sm hover:underline"
            >
              How directional drilling works
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="bg-card border border-border rounded-xl p-7">
            <h2 className="text-xl font-bold mb-3">Contractor with a trench on the schedule?</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Electricians, plumbers, excavators, and builders sub their bores
              to us or hand them off for a referral. We usually show up in
              about 3 days and stay out of your way.
            </p>
            <Link
              href="/underground-utility-contractor"
              className="mt-5 inline-flex items-center gap-2 text-primary font-semibold text-sm hover:underline"
            >
              Commercial and contractor work
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-14">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6">Common questions</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {faqs.map((faq) => (
              <div key={faq.question} className="bg-card border border-border rounded-xl p-7">
                <h3 className="font-semibold mb-3">{faq.question}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="text-center bg-card border border-border rounded-xl p-10">
          <h2 className="text-2xl font-bold">Tell us where the line goes.</h2>
          <p className="mt-2 text-muted-foreground max-w-2xl mx-auto">
            We&apos;ll tell you what it costs to drill it. Free estimates, no
            obligation.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/contact"
              className="px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors text-center"
            >
              Request a Free Quote
            </Link>
            <a
              href={tel}
              className="flex items-center justify-center gap-2 px-8 py-3 border border-border font-medium rounded-lg hover:bg-muted transition-colors"
            >
              <Phone className="h-4 w-4" />
              Call {COMPANY.phone}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
