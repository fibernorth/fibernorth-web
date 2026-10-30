import { jsonLdScript } from "@/lib/json-ld";
import { Metadata } from "next";
import Link from "next/link";
import {
  COMPANY,
  FLEET,
  SERVICE_AREA_PRIMARY,
  SERVICE_COUNTIES,
  SERVICE_AREA_EXTENDED,
} from "@/lib/constants";
import {
  Droplets, Container, Zap, Flame, Sprout, Wifi, Route, Cable,
  Check, ArrowRight, Phone, Shield, Truck, MapPin,
} from "lucide-react";

const PAGE_URL = "https://fibernorth.com/directional-drilling";
const SEO_TITLE = "Directional Drilling Contractor | Traverse City, Northern MI";
const META_DESCRIPTION =
  "Directional drilling for water, power, gas, septic and fiber lines in Traverse City and Northern Michigan. No trench, free estimates. Call (231) 264-0757.";

export const metadata: Metadata = {
  title: { absolute: SEO_TITLE },
  description: META_DESCRIPTION,
  keywords: [
    "directional drilling",
    "directional drilling contractor",
    "directional drilling Traverse City",
    "directional boring Northern Michigan",
    "horizontal directional drilling Michigan",
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: SEO_TITLE,
    description: META_DESCRIPTION,
    url: PAGE_URL,
  },
};

const tel = `tel:+1${COMPANY.phone.replace(/[^0-9]/g, "")}`;

const whatWeBore = [
  {
    icon: Droplets,
    title: "Water lines",
    text: "To the garage, pole barn, shop, or a new house. Below the frost line, and a deeper bore costs about the same as a shallow one.",
    href: "/services/water-lines",
  },
  {
    icon: Zap,
    title: "Power",
    text: "Underground conduit to outbuildings, shops, and new construction.",
    href: "/services/power",
  },
  {
    icon: Flame,
    title: "Gas and propane",
    text: "Residential and commercial propane and natural gas lines.",
    href: "/services/gas",
  },
  {
    icon: Wifi,
    title: "Fiber and internet",
    text: "Fiber or cable out to a pole barn or office. Fiber is also our founding trade.",
    href: "/services/fiber",
  },
  {
    icon: Container,
    title: "Septic",
    text: "Septic lines and pump-up systems, bored under the lawn instead of trenched through it.",
    href: "/services/septic",
  },
  {
    icon: Sprout,
    title: "Irrigation",
    text: "Irrigation lines for farms, golf courses, and large properties.",
    href: "/services/irrigation",
  },
  {
    icon: Route,
    title: "Under driveways and roads",
    text: "We cross driveways, roads, and culverts without cutting or patching them.",
    href: "/services/culvert-driveway",
  },
  {
    icon: Cable,
    title: "Conduit for contractors and utilities",
    text: "Conduit runs for electricians, excavators, builders, internet providers, and campgrounds.",
    href: "/for-contractors",
  },
];

const steps = [
  {
    title: "Find what's already buried",
    text: "MISS DIG marks the public utilities. Our own locating specialist finds the private lines MISS DIG won't mark. Where we need to cross something, the hydrovac exposes it first so we see it instead of guessing.",
  },
  {
    title: "Dig two small pits",
    text: "One where the drill goes in and one where it comes out. That's all the digging there is.",
  },
  {
    title: "Drill the path",
    text: "The drill steers a head underground from pit to pit, under the lawn, trees, driveway, or road. Nothing in between gets touched.",
  },
  {
    title: "Pull the line back",
    text: "Your pipe or conduit gets pulled back through the hole. We fill the pits, clean up, and go home. Most jobs are done in a day or less.",
  },
];

const drills = FLEET.filter(
  (e) => e.manufacturer === "Vermeer" && /x/i.test(e.model)
);

const proof = [
  {
    title: "145,000 feet of fiber duct",
    text: "Installed in three and a half months on a fiber-to-the-home build for a regional network contractor, plus 150+ home drops. Every foot GPS-tracked.",
  },
  {
    title: "110,000 feet of conduit in winter",
    text: "For a local internet provider across Missaukee and Benzie Counties. Frozen ground doesn't stop a directional drill.",
  },
  {
    title: "Conduit under a parking lot",
    text: "Lighting conduit bored under existing pavement in Manistee for an electrical contractor. No asphalt cuts.",
  },
];

const faqs = [
  {
    question: "How much does directional drilling cost?",
    answer:
      "A typical 100-foot bore runs $3,000, done in a day or less. That covers drilling the path, pulling your pipe or conduit through, and cleanup. There's no restoration bill afterward because nothing gets torn up. Every property is different, which is why estimates are free.",
  },
  {
    question: "Does directional drilling damage the yard?",
    answer:
      "No. The only digging is two small pits, one where the drill enters and one where it exits. Everything in between stays as it is: lawn, trees, flower beds, irrigation. We fill the pits before we leave. Your lawn looks like we were never there.",
  },
  {
    question: "Can you drill under a driveway, septic field, or trees?",
    answer:
      "Yes. That's the whole reason directional drilling exists. The drill head travels underneath driveways, sidewalks, mature tree roots, septic tanks and drain fields, decks, and landscaping from pit to pit. A trench has to go around those things or through them. We just go under.",
  },
  {
    question: "What size pipe can you install?",
    answer:
      "We pull product up to 10 inches in diameter, from a half-inch water service up to irrigation mains and large casings. We run five directional drills, so there's a right-size machine for a backyard water line or a long commercial run.",
  },
  {
    question: "What area do you serve?",
    answer:
      "We work within about 80 miles of Williamsburg, MI. That covers Traverse City, Petoskey, Charlevoix, Gaylord, Grayling, Cadillac, Kalkaska, and the Leelanau Peninsula, plus everywhere in between.",
  },
];

const serviceJsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Directional Drilling",
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
  areaServed: [
    ...SERVICE_COUNTIES.map((c) => ({ "@type": "AdministrativeArea", name: `${c} County, MI` })),
    ...[...SERVICE_AREA_PRIMARY, ...SERVICE_AREA_EXTENDED].map((town) => ({
      "@type": "City",
      name: `${town}, MI`,
    })),
  ],
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

export default function DirectionalDrillingPage() {
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
            Traverse City &amp; Northern Michigan
          </p>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight">
            Directional Drilling in Northern Michigan
          </h1>
          <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
            Directional drilling is how we put a line underground without
            digging a trench. We drill from one small pit to another, under
            your lawn, driveway, trees, or road, and pull the pipe or conduit
            back through. We&apos;re based in Williamsburg and work all over
            Northern Michigan.
          </p>
          <p className="mt-3 text-lg text-muted-foreground leading-relaxed">
            We got our start building fiber optic lines for internet providers.
            Thousands of feet of bores later, burying lines by directional
            drilling is what we specialize in, for homes, farms, businesses, and
            other contractors.
          </p>
          <p className="mt-3 text-sm text-primary font-semibold uppercase tracking-wider">
            Typical 100 ft bore: $3,000, done in a day or less. Free estimates.
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
              Locating specialist on staff
            </span>
          </div>
        </div>

        {/* What we bore */}
        <section className="mb-14">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">What we drill for</h2>
          <p className="text-muted-foreground mb-6 max-w-3xl">
            If it belongs underground, we can usually get it there without a
            trench.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {whatWeBore.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="group bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors"
              >
                <item.icon className="h-7 w-7 text-primary mb-3" />
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.text}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mb-14 bg-card border border-border rounded-xl p-7 sm:p-10">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6">How directional drilling works</h2>
          <ol className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, i) => (
              <li key={step.title}>
                <p className="text-3xl font-black text-primary">{i + 1}</p>
                <h3 className="font-semibold mt-1 mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {step.text}
                </p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-col sm:flex-row gap-x-8 gap-y-3 text-sm">
            <Link
              href="/blog/how-directional-drilling-works"
              className="inline-flex items-center gap-2 text-primary font-semibold hover:underline"
            >
              The longer version, step by step
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/why-trenchless"
              className="inline-flex items-center gap-2 text-primary font-semibold hover:underline"
            >
              Drilling vs. trenching, cost side by side
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Equipment */}
        <section className="mb-14">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">The drills</h2>
          <p className="text-muted-foreground mb-6 max-w-3xl">
            We own five Vermeer directional drills, so the machine fits the
            job. A compact rig for a tight backyard, bigger rigs for long
            utility and fiber runs. We pull back pipe and conduit up to 10
            inches in diameter, and our own hydrovac exposes existing lines
            before we drill near them.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {drills.map((d, i) => (
              <div
                key={`${d.model}-${d.year}-${i}`}
                className="bg-card border border-border rounded-lg p-5"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold flex items-center gap-2">
                    <Truck className="h-4 w-4 text-primary" />
                    {d.manufacturer} {d.model}
                  </h3>
                  {d.year > 0 && (
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                      {d.year}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{d.capability}</p>
              </div>
            ))}
          </div>
          <Link
            href="/fleet"
            className="mt-6 inline-flex items-center gap-2 text-primary font-semibold text-sm hover:underline"
          >
            See the whole fleet
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        {/* Residential vs commercial */}
        <section className="mb-14 grid md:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-xl p-7">
            <h2 className="text-xl font-bold mb-3">For homeowners</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Most of our home jobs are a line to a garage, pole barn, or
              shop. You get a free estimate and a real number. We&apos;re
              usually on site within 3 days of the MISS DIG marks, and most
              jobs are done in a day. When we leave, your yard looks like we
              were never there.
            </p>
            <Link
              href="/services"
              className="mt-5 inline-flex items-center gap-2 text-primary font-semibold text-sm hover:underline"
            >
              Lines we install
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="bg-card border border-border rounded-xl p-7">
            <h2 className="text-xl font-bold mb-3">
              For contractors, utilities &amp; businesses
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Electricians, excavators, plumbers, and builders sub their bores
              to us or hand them off for a 10% referral. Internet providers
              and telecoms use us for mainline and drops. Campgrounds have us
              bore fiber, water, and power in the off-season. Same crews,
              same care, any size of job.
            </p>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Link href="/for-contractors" className="inline-flex items-center gap-2 text-primary font-semibold hover:underline">
                For contractors <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/fiber-construction" className="inline-flex items-center gap-2 text-primary font-semibold hover:underline">
                Fiber construction <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/campgrounds" className="inline-flex items-center gap-2 text-primary font-semibold hover:underline">
                Campgrounds <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Proof */}
        <section className="mb-14">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6">Work we&apos;ve done</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {proof.map((p) => (
              <div key={p.title} className="bg-card border border-border rounded-xl p-6">
                <h3 className="font-semibold mb-2">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <Link href="/projects" className="inline-flex items-center gap-2 text-primary font-semibold hover:underline">
              More projects <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/fiber-construction" className="inline-flex items-center gap-2 text-primary font-semibold hover:underline">
              Our fiber track record <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Where */}
        <section className="mb-14 bg-card border border-border rounded-xl p-7 sm:p-10">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2 flex items-center gap-3">
            <MapPin className="h-6 w-6 text-primary" />
            Where we drill
          </h2>
          <p className="text-muted-foreground mb-6 max-w-3xl">
            We&apos;re in Williamsburg, just east of Traverse City. Most of our
            work is in {SERVICE_COUNTIES.slice(0, -1).join(", ")}, and {SERVICE_COUNTIES.at(-1)}{" "}
            counties.
          </p>
          <h3 className="text-sm font-semibold mb-3">Within about an hour</h3>
          <div className="flex flex-wrap gap-2 mb-5">
            {SERVICE_AREA_PRIMARY.map((town) => (
              <span key={town} className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full">
                {town}
              </span>
            ))}
          </div>
          <h3 className="text-sm font-semibold mb-3">One to two hours out</h3>
          <div className="flex flex-wrap gap-2">
            {SERVICE_AREA_EXTENDED.map((town) => (
              <span key={town} className="text-xs bg-secondary/10 text-secondary px-2.5 py-1 rounded-full">
                {town}
              </span>
            ))}
          </div>
          <Link
            href="/service-area"
            className="mt-6 inline-flex items-center gap-2 text-primary font-semibold text-sm hover:underline"
          >
            Service area map
            <ArrowRight className="h-4 w-4" />
          </Link>
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
          <Link
            href="/faq"
            className="mt-6 inline-flex items-center gap-2 text-primary font-semibold text-sm hover:underline"
          >
            More answers
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        {/* CTA */}
        <div className="text-center bg-card border border-border rounded-xl p-10">
          <h2 className="text-2xl font-bold">Tell us where the line goes.</h2>
          <p className="mt-2 text-muted-foreground max-w-2xl mx-auto">
            Free estimates, no obligation. We usually schedule within 3 days
            of MISS DIG marking, and most jobs are done in a day or less.
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
