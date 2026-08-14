import Link from "next/link";
import Script from "next/script";
import Image from "next/image";
import { COMPANY, SERVICES, TRUST_SIGNALS } from "@/lib/constants";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "FiberNorth Underground",
  alternateName: "FiberNorth, Inc.",
  description: "Professional directional drilling and trenchless utility installations in Northern Michigan.",
  url: "https://fibernorth.com",
  telephone: "+12312640757",
  email: "office@fibernorth.com",
  address: {
    "@type": "PostalAddress",
    streetAddress: "6227 Arnold Rd",
    addressLocality: "Williamsburg",
    addressRegion: "MI",
    postalCode: "49690",
    addressCountry: "US",
  },
  geo: { "@type": "GeoCoordinates", latitude: 44.7631, longitude: -85.3935 },
  openingHoursSpecification: {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    opens: "07:00",
    closes: "14:00",
  },
  areaServed: { "@type": "GeoCircle", geoMidpoint: { "@type": "GeoCoordinates", latitude: 44.7631, longitude: -85.3935 }, geoRadius: "100 mi" },
  serviceType: ["Directional Drilling", "Trenchless Installation", "Underground Utilities"],
};
import {
  Droplets,
  Container,
  CloudRain,
  Zap,
  Flame,
  Sprout,
  Wifi,
  Route,
  Shield,
  MapPin,
  Radar,
  FileText,
  ArrowRight,
  Phone,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Droplets,
  Container,
  CloudRain,
  Zap,
  Flame,
  Sprout,
  Wifi,
  Route,
  Shield,
  MapPin,
  Radar,
  FileText,
};

export default function HomePage() {
  return (
    <>
      <Script
        id="json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Hero */}
      <section className="relative py-24 sm:py-32 lg:py-44 overflow-hidden">
        <Image
          src="/images/hero-estate.jpg"
          alt="Beautiful home with pristine lawn"
          fill
          className="object-cover object-bottom"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/40 to-transparent" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white">
              We Bore So You Don&apos;t
              <br />
              <span className="text-primary">Have to Dig</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-white/80">
              Professional directional drilling &amp; trenchless installations
              across Northern Michigan. Your yard, landscaping, and trees stay
              completely intact.
            </p>
            <p className="mt-3 text-sm text-primary font-semibold uppercase tracking-wider">
              Often cheaper than trenching when you factor in restoration costs
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-start gap-4">
              <Link
                href="/contact"
                className="px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors text-lg shadow-lg"
              >
                Get a Free Quote
              </Link>
              <Link
                href="/why-trenchless"
                className="px-8 py-3 bg-white/10 backdrop-blur text-white font-medium rounded-lg hover:bg-white/20 transition-colors text-lg border border-white/20"
              >
                Why Trenchless?
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Cost Savings - The Big Message */}
      <section className="py-16 sm:py-24 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black">
              Think Trenching Is <span className="text-primary">Cheaper?</span>
            </h2>
            <p className="mt-3 text-lg text-muted-foreground max-w-2xl mx-auto">
              Add up the real cost of an open trench — then compare.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            {/* Trenching column */}
            <div className="bg-destructive/5 border-2 border-destructive/20 rounded-xl p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-destructive/10 rounded-full flex items-center justify-center">
                  <span className="text-destructive font-black text-lg">✕</span>
                </div>
                <h3 className="text-xl font-bold">Open Trench</h3>
              </div>
              <ul className="space-y-3">
                {[
                  "Trencher rental or excavator hire",
                  "Labor to dig the trench",
                  "Labor to backfill and compact",
                  "New topsoil delivery and spreading",
                  "Grass seed or sod installation",
                  "Risk of cutting irrigation lines",
                  "Risk of damaging tree root systems",
                  "Driveway or sidewalk cut and repatch",
                  "Weeks or months waiting for regrowth",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm">
                    <span className="text-destructive mt-0.5 font-bold">+</span>
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 pt-4 border-t border-destructive/20">
                <p className="text-sm font-semibold text-destructive">
                  Total: Trench cost + restoration + time + risk
                </p>
              </div>
            </div>

            {/* Boring column */}
            <div className="bg-primary/5 border-2 border-primary/20 rounded-xl p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-accent/10 rounded-full flex items-center justify-center">
                  <span className="text-accent font-black text-lg">✓</span>
                </div>
                <h3 className="text-xl font-bold">Directional Bore</h3>
              </div>
              <ul className="space-y-3">
                {[
                  "Two small holes — entry and exit",
                  "In and out in hours, not days",
                  "Zero yard damage in between",
                  "No restoration needed",
                  "No topsoil, no seed, no waiting",
                  "Irrigation lines stay untouched",
                  "Trees and landscaping stay intact",
                  "Driveways and sidewalks untouched",
                  "Property looks like we were never there",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm">
                    <span className="text-accent mt-0.5 font-bold">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 pt-4 border-t border-primary/20">
                <p className="text-sm font-semibold text-primary">
                  Total: One price. No surprises. Done in a day.
                </p>
              </div>
            </div>
          </div>

          <div className="text-center">
            <Link
              href="/why-trenchless"
              className="inline-flex items-center gap-2 text-primary font-semibold text-lg hover:underline"
            >
              See the full comparison
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Your Yard Stays Intact - Image Section */}
      <section className="relative py-20 sm:py-28 overflow-hidden">
        <Image
          src="/images/yard-pristine.jpg"
          alt="Beautiful home with pristine landscaping"
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-transparent" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-xl">
            <h2 className="text-3xl sm:text-4xl font-black text-white">
              Your Yard Stays <span className="text-primary">Pristine</span>
            </h2>
            <p className="mt-4 text-white/80 text-lg">
              We bore underneath your property at depth — your grass, trees,
              landscaping, driveways, and irrigation all stay completely
              untouched. When we leave, the only evidence is two small filled
              holes.
            </p>
            <div className="mt-6 flex flex-wrap gap-4">
              <div className="bg-white/10 backdrop-blur rounded-lg px-4 py-3 border border-white/20">
                <p className="text-2xl font-black text-primary">3 Days</p>
                <p className="text-xs text-white/70">Call to scheduled</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-lg px-4 py-3 border border-white/20">
                <p className="text-2xl font-black text-primary">Hours</p>
                <p className="text-xs text-white/70">Not days on your property</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-lg px-4 py-3 border border-white/20">
                <p className="text-2xl font-black text-primary">Zero</p>
                <p className="text-xs text-white/70">Restoration needed</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold">What We Install</h2>
            <p className="mt-3 text-muted-foreground text-lg">
              Underground utility installations without the mess
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {SERVICES.map((service) => {
              const Icon = iconMap[service.icon];
              return (
                <Link
                  key={service.slug}
                  href={`/services#${service.slug}`}
                  className="group bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors"
                >
                  {Icon && (
                    <Icon className="h-8 w-8 text-primary mb-4 group-hover:scale-110 transition-transform" />
                  )}
                  <h3 className="font-semibold mb-2">{service.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {service.shortDescription}
                  </p>
                </Link>
              );
            })}
          </div>
          <div className="text-center mt-8">
            <Link
              href="/services"
              className="inline-flex items-center gap-2 text-primary font-medium hover:underline"
            >
              View all services
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Trust Signals */}
      <section className="py-12 bg-card border-y border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {TRUST_SIGNALS.map((signal) => {
              const Icon = iconMap[signal.icon];
              return (
                <div
                  key={signal.text}
                  className="flex items-center gap-3 justify-center"
                >
                  {Icon && <Icon className="h-6 w-6 text-primary shrink-0" />}
                  <span className="text-sm font-medium">{signal.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Who We Serve */}
      <section className="py-16 sm:py-20 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">
            Who We <span className="text-primary">Work With</span>
          </h2>
          <div className="grid sm:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden mb-4">
                <Image src="/images/house-garage.jpg" alt="Home with garage" fill className="object-cover" />
              </div>
              <h3 className="text-lg font-bold">Homeowners</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Running water, power, gas, or internet to your garage, pole
                barn, or outbuilding — without tearing up your yard.
              </p>
            </div>
            <div className="text-center">
              <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden mb-4">
                <Image src="/images/construction-crew.jpg" alt="Construction workers" fill className="object-cover" />
              </div>
              <h3 className="text-lg font-bold">Builders &amp; Contractors</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Need a boring sub? We show up on time with the right rig and
                get it done. No drama, no delays.
              </p>
            </div>
            <div className="text-center">
              <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden mb-4">
                <Image src="/images/pole-barn.jpg" alt="Farm field" fill className="object-cover" />
              </div>
              <h3 className="text-lg font-bold">Farmers</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Irrigation lines installed across fields with minimal
                disruption to your land and operation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-20 sm:py-24 overflow-hidden">
        <Image
          src="/images/backyard-trees.jpg"
          alt="Beautiful backyard"
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-black text-white">
            Ready to Get Started?
          </h2>
          <p className="mt-4 text-white/80 text-lg">
            Most jobs are scheduled within 3 days and completed in a single day.
            Get a free estimate — no obligation.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/contact"
              className="px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors text-lg shadow-lg"
            >
              Get a Free Quote
            </Link>
            <a
              href={`tel:${COMPANY.phone.replace(/[^0-9]/g, "")}`}
              className="flex items-center gap-2 px-8 py-3 bg-white/10 backdrop-blur text-white font-medium rounded-lg hover:bg-white/20 transition-colors text-lg border border-white/20"
            >
              <Phone className="h-5 w-5" />
              {COMPANY.phone}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
