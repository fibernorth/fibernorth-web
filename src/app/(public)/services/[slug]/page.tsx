import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SERVICES, COMPANY } from "@/lib/constants";
import { SERVICE_DETAILS } from "@/lib/service-content";
import {
  Droplets, Container, CloudRain, Zap, Flame, Sprout, Wifi, Route,
  Check, ArrowRight, Phone,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Droplets, Container, CloudRain, Zap, Flame, Sprout, Wifi, Route,
};

export function generateStaticParams() {
  return SERVICES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const detail = SERVICE_DETAILS[slug];
  if (!detail) return {};
  return {
    title: { absolute: detail.seoTitle },
    description: detail.metaDescription,
  };
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = SERVICES.find((s) => s.slug === slug);
  const detail = SERVICE_DETAILS[slug];
  if (!service || !detail) notFound();

  const Icon = iconMap[service.icon];
  const others = SERVICES.filter((s) => s.slug !== slug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.name,
    description: detail.metaDescription,
    provider: {
      "@type": "LocalBusiness",
      name: "FiberNorth Underground",
      telephone: "+12312640757",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Williamsburg",
        addressRegion: "MI",
        postalCode: "49690",
      },
    },
    areaServed: "Northern Michigan",
  };

  return (
    <div className="py-16 sm:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="max-w-3xl mb-14">
          <div className="flex items-center gap-3 mb-5">
            {Icon && (
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <Icon className="h-6 w-6 text-primary" />
              </div>
            )}
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              {service.name}
            </p>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight">
            {detail.headline}
          </h1>
          <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
            {detail.description}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4">
            <Link
              href="/contact"
              className="px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors text-center"
            >
              Get a Free Quote
            </Link>
            <a
              href={`tel:+1${COMPANY.phone.replace(/[^0-9]/g, "")}`}
              className="flex items-center justify-center gap-2 px-8 py-3 border border-border font-medium rounded-lg hover:bg-muted transition-colors"
            >
              <Phone className="h-4 w-4" />
              {COMPANY.phone}
            </a>
          </div>
        </div>

        {/* What we install + why no trench */}
        <div className="grid md:grid-cols-2 gap-6 mb-14">
          <div className="bg-card border border-border rounded-xl p-7">
            <h2 className="font-bold text-lg mb-4">What we install</h2>
            <ul className="space-y-3">
              {detail.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm">
                  <Check className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-card border border-border rounded-xl p-7">
            <h2 className="font-bold text-lg mb-4">Why not just dig a trench?</h2>
            <p className="text-sm text-muted-foreground mb-4">
              A trench means digging up your lawn, backfilling, hauling topsoil,
              reseeding, and months of waiting for grass to grow back — plus
              cutting through anything in the path. We bore underneath instead:
              two small holes, done in a day, and usually right in the same
              price range once you add up what the trench really costs.
            </p>
            <Link
              href="/why-trenchless"
              className="inline-flex items-center gap-2 text-primary font-semibold text-sm hover:underline"
            >
              See the trench vs. bore math
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Other services */}
        <div className="mb-14">
          <h2 className="font-bold text-lg mb-5">Other lines we bury</h2>
          <div className="flex flex-wrap gap-2">
            {others.map((s) => (
              <Link
                key={s.slug}
                href={`/services/${s.slug}`}
                className="px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
              >
                {s.name}
              </Link>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center bg-card border border-border rounded-xl p-10">
          <h2 className="text-2xl font-bold">Ready to get it buried?</h2>
          <p className="mt-2 text-muted-foreground">
            Free estimate, usually scheduled within 3 days, and most jobs are
            done in a single day.
          </p>
          <Link
            href="/contact"
            className="inline-block mt-6 px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors"
          >
            Request a Free Quote
          </Link>
        </div>
      </div>
    </div>
  );
}
