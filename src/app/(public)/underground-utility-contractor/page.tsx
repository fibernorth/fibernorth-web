import { jsonLdScript } from "@/lib/json-ld";
import { Metadata } from "next";
import Link from "next/link";
import { COMPANY, SERVICE_COUNTIES } from "@/lib/constants";
import {
  ArrowRight, Cable, Check, FileCheck, Layers, Phone, Radar, Route, Shield, Snowflake,
} from "lucide-react";

const PAGE_URL = "https://fibernorth.com/underground-utility-contractor";
const SEO_TITLE = "Underground Utility Contractor | Traverse City, MI";
const META_DESCRIPTION =
  "Underground utility contractor in Northern Michigan. Directional drilling for power, water and fiber conduit, road and driveway crossings, hydrovac locating.";

export const metadata: Metadata = {
  title: { absolute: SEO_TITLE },
  description: META_DESCRIPTION,
  keywords: [
    "underground utility contractor",
    "underground utility contractor Michigan",
    "conduit installation",
    "directional boring contractor",
    "road crossing bore",
    "utility boring subcontractor",
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: { title: SEO_TITLE, description: META_DESCRIPTION, url: PAGE_URL },
};

const tel = `tel:+1${COMPANY.phone.replace(/[^0-9]/g, "")}`;

const work = [
  {
    icon: Cable,
    title: "Conduit installation",
    text: "Power, water, and fiber conduit bored in, with pullback up to 10 inches in diameter.",
  },
  {
    icon: Layers,
    title: "Multiple conduits in one bore",
    text: "Power and fiber headed the same way can go in on the same pull. One bore, one set of pits.",
  },
  {
    icon: Route,
    title: "Road and driveway crossings",
    text: "Under roads, driveways, parking lots, and culverts without cutting the surface or closing it.",
  },
  {
    icon: Radar,
    title: "Hydrovac and locating",
    text: "MISS DIG on every job, a locating specialist on staff for private lines, and our own hydrovac to expose what we cross.",
  },
  {
    icon: FileCheck,
    title: "Right-of-way work",
    text: "We work in county road commission right-of-way and utility easements, and we handle the permit coordination that goes with it.",
  },
  {
    icon: Snowflake,
    title: "Year-round",
    text: "Frozen ground doesn't stop a directional drill. We keep boring through the winter.",
  },
];

const audiences = [
  {
    title: "Builders, electricians, and excavators",
    text: "Sub the bore to us and mark it up, or hand it off for a 10% referral. We usually show up in about 3 days, do our piece, and leave.",
    href: "/for-contractors",
    link: "For contractors",
  },
  {
    title: "Internet providers and municipalities",
    text: "Mainline in the right-of-way, FTTP drops, blowing, and splicing. Fiber is where we started.",
    href: "/fiber-construction",
    link: "Fiber construction",
  },
  {
    title: "Campgrounds",
    text: "Fiber, water, power, and sewer bored in during the off-season, without tearing up sites.",
    href: "/campgrounds",
    link: "Campgrounds",
  },
  {
    title: "Businesses",
    text: "Conduit between buildings or under the parking lot, with no pavement cuts. We also sell business internet.",
    href: "/business-internet",
    link: "Business internet",
  },
];

const proof = [
  {
    title: "145,000 feet of fiber duct",
    where: "Wexford County",
    text: "Installed in three and a half months for a regional network contractor, plus 150+ home drops.",
  },
  {
    title: "110,000 feet of conduit in winter",
    where: "Missaukee & Benzie Counties",
    text: "For a local internet provider. The schedule held all season.",
  },
  {
    title: "Parking lot lighting conduit",
    where: "Manistee",
    text: "Bored under existing pavement for an electrical contractor. No asphalt cuts.",
  },
];

const faqs = [
  {
    question: "Do you sub for other contractors?",
    answer:
      "Yes. Electricians, excavators, plumbers, and builders sub their bores to us all the time. Mark it up and keep the customer, or hand it off and take 10%.",
  },
  {
    question: "Can you put more than one conduit in a bore?",
    answer:
      "Yes. When lines run the same route, we can pull more than one conduit back through the same bore. Tell us what's going in and we'll size it.",
  },
  {
    question: "Do you work in the road right-of-way?",
    answer:
      "Yes. We work in county road commission right-of-way and utility easements and handle the permit coordination. We've been doing it in these counties for more than a decade.",
  },
  {
    question: "How do you avoid hitting existing utilities?",
    answer:
      "MISS DIG marks the public lines. Our locating specialist finds the private ones and double-checks the marks. Where we have to cross something, the hydrovac exposes it first.",
  },
  {
    question: "How big a job can you take?",
    answer:
      "Anything from a single road crossing to a multi-county fiber build. We run five directional drills with pullback up to 10 inches.",
  },
];

const serviceJsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Underground Utility Contractor",
  serviceType: "Underground utility construction",
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

export default function UndergroundUtilityContractorPage() {
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
            Commercial &amp; Contractor Work
          </p>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight">
            Underground Utility Contractor in Northern Michigan
          </h1>
          <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
            We put power, water, and fiber conduit in the ground by directional
            drilling. Builders, electricians, excavators, campgrounds,
            businesses, towns, and internet providers call us when a line has
            to go under something and nobody wants a trench.
          </p>
          <p className="mt-3 text-lg text-muted-foreground leading-relaxed">
            We started in fiber optic construction and still do it. Burying
            lines by directional drilling is what we specialize in. Five
            drills, our own hydrovac, and a locating specialist on staff.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4">
            <Link
              href="/contact"
              className="px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors text-center"
            >
              Send Us the Job
            </Link>
            <a
              href={tel}
              className="flex items-center justify-center gap-2 px-8 py-3 border border-border font-medium rounded-lg hover:bg-muted transition-colors"
            >
              <Phone className="h-4 w-4" />
              {COMPANY.phone}
            </a>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-accent" />
              Fully licensed &amp; insured
            </span>
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-accent" />
              MISS DIG 811 compliant
            </span>
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-accent" />
              Free estimates
            </span>
          </div>
        </div>

        {/* Work */}
        <section className="mb-14">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6">What we do</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {work.map((w) => (
              <div key={w.title} className="bg-card border border-border rounded-xl p-6">
                <w.icon className="h-7 w-7 text-primary mb-3" />
                <h3 className="font-semibold mb-2">{w.title}</h3>
                <p className="text-sm text-muted-foreground">{w.text}</p>
              </div>
            ))}
          </div>
          <Link
            href="/directional-drilling"
            className="mt-6 inline-flex items-center gap-2 text-primary font-semibold text-sm hover:underline"
          >
            How our directional drilling works
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        {/* Who */}
        <section className="mb-14">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6">Who we work for</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {audiences.map((a) => (
              <div key={a.title} className="bg-card border border-border rounded-xl p-7">
                <h3 className="text-lg font-bold mb-2">{a.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{a.text}</p>
                <Link
                  href={a.href}
                  className="mt-4 inline-flex items-center gap-2 text-primary font-semibold text-sm hover:underline"
                >
                  {a.link}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* Proof */}
        <section className="mb-14 bg-card border border-border rounded-xl p-7 sm:p-10">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6">Recent work</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {proof.map((p) => (
              <div key={p.title}>
                <h3 className="font-semibold">{p.title}</h3>
                <p className="text-xs text-muted-foreground mt-1 mb-2">{p.where}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.text}</p>
              </div>
            ))}
          </div>
          <Link
            href="/projects"
            className="mt-6 inline-flex items-center gap-2 text-primary font-semibold text-sm hover:underline"
          >
            More projects
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        {/* Area */}
        <section className="mb-14">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">Where we work</h2>
          <p className="text-muted-foreground max-w-3xl">
            We&apos;re based in Williamsburg, just east of Traverse City. Most
            of our work is in {SERVICE_COUNTIES.slice(0, -1).join(", ")}, and{" "}
            {SERVICE_COUNTIES.at(-1)} counties. Larger jobs take us farther.{" "}
            <Link href="/service-area" className="text-primary hover:underline">
              See the service area
            </Link>
            .
          </p>
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
          <h2 className="text-2xl font-bold">Got a bore on the schedule?</h2>
          <p className="mt-2 text-muted-foreground max-w-2xl mx-auto">
            Send us the route and what&apos;s going in the ground. Free
            estimates, and we usually get you on the schedule in about 3 days.
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
