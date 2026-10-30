import { jsonLdScript } from "@/lib/json-ld";
import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { COMPANY, SERVICES } from "@/lib/constants";
import { TOWN_PAGES, TOWN_PAGE_HREF, getTownPage } from "@/lib/town-pages";
import { ArrowRight, Check, MapPin, Phone, Shield } from "lucide-react";

export const dynamicParams = false;

export function generateStaticParams() {
  return TOWN_PAGES.map((t) => ({ town: t.slug }));
}

const pageUrl = (slug: string) => `https://fibernorth.com/directional-drilling/${slug}`;

const seoTitle = (name: string) => `Directional Drilling in ${name}, MI | FiberNorth`;

const metaDescription = (name: string, county: string) =>
  `Directional drilling in ${name} and ${county} County. Water, power, gas and internet lines bored with no trench. Free estimates. Call ${COMPANY.phone}.`;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ town: string }>;
}): Promise<Metadata> {
  const { town } = await params;
  const t = getTownPage(town);
  if (!t) return {};
  const title = seoTitle(t.name);
  const description = metaDescription(t.name, t.county);
  return {
    title: { absolute: title },
    description,
    keywords: [
      `directional drilling ${t.name}`,
      `directional boring ${t.name} MI`,
      `bury water line ${t.name}`,
      `${t.county} County directional drilling`,
    ],
    alternates: { canonical: pageUrl(t.slug) },
    openGraph: { title, description, url: pageUrl(t.slug) },
  };
}

const tel = `tel:+1${COMPANY.phone.replace(/[^0-9]/g, "")}`;

const steps = [
  {
    title: "Find what's already buried",
    text: "MISS DIG marks the public utilities. Our locating specialist finds the private lines they won't mark, and the hydrovac exposes anything we need to cross.",
  },
  {
    title: "Dig two small pits",
    text: "One where the drill goes in and one where it comes out. That's all the digging there is.",
  },
  {
    title: "Drill the path",
    text: "The drill steers a head underground from pit to pit, under the lawn, trees, driveway, or road.",
  },
  {
    title: "Pull the line back",
    text: "Your pipe or conduit gets pulled back through. We fill the pits, clean up, and go home.",
  },
];

export default async function TownDrillingPage({
  params,
}: {
  params: Promise<{ town: string }>;
}) {
  const { town } = await params;
  const t = getTownPage(town);
  if (!t) notFound();

  const url = pageUrl(t.slug);
  const description = metaDescription(t.name, t.county);
  const distance =
    t.zone === "primary"
      ? "Within about an hour of our Williamsburg shop. Standard pricing."
      : "One to two hours from our Williamsburg shop. Small travel charge.";

  const faqs = [
    {
      question: `Do you do directional drilling in ${t.name}?`,
      answer: `Yes. ${t.name} is in ${t.county} County, ${
        t.zone === "primary"
          ? "within about an hour of our shop in Williamsburg, so it's standard pricing."
          : "one to two hours from our shop in Williamsburg. We work there with a small travel charge for the drive."
      } We also work in ${t.nearby.slice(0, -1).join(", ")} and ${t.nearby.at(-1)}.`,
    },
    {
      question: `How much does it cost to bury a line in ${t.name}?`,
      answer: `A typical bore up to 150 feet runs $3,000 and is done in a day or less. That covers drilling, pulling your pipe or conduit through, and cleanup. Every property is different, so the estimate is free.`,
    },
    {
      question: "How soon can you get here?",
      answer:
        "We usually get you on the schedule in about 3 days, once MISS DIG has marked the public utilities. Most jobs take a day or less once we're on site.",
    },
  ];

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `Directional Drilling in ${t.name}, MI`,
    serviceType: "Directional drilling",
    description,
    url,
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
      { "@type": "City", name: `${t.name}, MI` },
      { "@type": "AdministrativeArea", name: `${t.county} County, MI` },
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

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Directional Drilling", item: "https://fibernorth.com/directional-drilling" },
      { "@type": "ListItem", position: 2, name: t.name, item: url },
    ],
  };

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd) }}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="max-w-3xl mb-14">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-4">
            <Link href="/directional-drilling" className="hover:underline">
              Directional Drilling
            </Link>{" "}
            / {t.county} County, MI
          </p>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight">
            Directional Drilling in {t.name}
          </h1>
          {t.intro.map((p) => (
            <p key={p} className="mt-5 text-lg text-muted-foreground leading-relaxed">
              {p}
            </p>
          ))}
          <p className="mt-4 text-sm text-primary font-semibold uppercase tracking-wider">
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
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-accent" />
              Fully licensed &amp; insured
            </span>
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-accent" />
              MISS DIG 811 compliant
            </span>
          </div>
        </div>

        {/* Local facts */}
        <section className="mb-14 grid sm:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">County</p>
            <p className="font-semibold">{t.county} County</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Distance</p>
            <p className="font-semibold">{distance}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Scheduling</p>
            <p className="font-semibold">Usually about 3 days after MISS DIG marks.</p>
          </div>
        </section>

        {/* What we drill for */}
        <section className="mb-14">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">
            Lines we bury in and around {t.name}
          </h2>
          <p className="text-muted-foreground mb-6 max-w-3xl">
            If it belongs underground, we can usually get it there without a
            trench.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {SERVICES.map((s) => (
              <Link
                key={s.slug}
                href={`/services/${s.slug}`}
                className="group bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-colors"
              >
                <h3 className="font-semibold mb-1">{s.name}</h3>
                <p className="text-sm text-muted-foreground">{s.shortDescription}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mb-14 bg-card border border-border rounded-xl p-7 sm:p-10">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6">How it works</h2>
          <ol className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, i) => (
              <li key={step.title}>
                <p className="text-3xl font-black text-primary">{i + 1}</p>
                <h3 className="font-semibold mt-1 mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-col sm:flex-row gap-x-8 gap-y-3 text-sm">
            <Link
              href="/directional-drilling"
              className="inline-flex items-center gap-2 text-primary font-semibold hover:underline"
            >
              More on directional drilling
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

        {/* Nearby project */}
        {t.project && (
          <section className="mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold mb-6">Work we&apos;ve done nearby</h2>
            <div className="bg-card border border-border rounded-xl p-6 max-w-2xl">
              <h3 className="font-semibold">{t.project.title}</h3>
              <p className="text-xs text-muted-foreground mt-1 mb-3 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {t.project.location}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">{t.project.text}</p>
              <Link
                href={t.project.href}
                className="mt-4 inline-flex items-center gap-2 text-primary font-semibold text-sm hover:underline"
              >
                {t.project.href === "/projects" ? "More projects" : "Our fiber track record"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>
        )}

        {/* Nearby towns */}
        <section className="mb-14 bg-card border border-border rounded-xl p-7 sm:p-10">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2 flex items-center gap-3">
            <MapPin className="h-6 w-6 text-primary" />
            Near {t.name}
          </h2>
          <p className="text-muted-foreground mb-6 max-w-3xl">
            We also drill in these towns around {t.name}.
          </p>
          <div className="flex flex-wrap gap-2">
            {t.nearby.map((name) => {
              const href = TOWN_PAGE_HREF[name];
              return href ? (
                <Link
                  key={name}
                  href={href}
                  className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full hover:bg-primary/20 underline-offset-2 hover:underline"
                >
                  {name}
                </Link>
              ) : (
                <span key={name} className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full">
                  {name}
                </span>
              );
            })}
          </div>
          <Link
            href="/service-area"
            className="mt-6 inline-flex items-center gap-2 text-primary font-semibold text-sm hover:underline"
          >
            Full service area
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        {/* FAQ */}
        <section className="mb-14">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6">Common questions</h2>
          <div className="grid md:grid-cols-3 gap-6">
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
          <h2 className="text-2xl font-bold">Need a line buried in {t.name}?</h2>
          <p className="mt-2 text-muted-foreground max-w-2xl mx-auto">
            Tell us where it goes. Free estimates, no obligation, and most jobs
            are done in a day or less.
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
