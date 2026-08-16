import Link from "next/link";
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
  serviceType: [
    "Directional Drilling",
    "Trenchless Installation",
    "Underground Utilities",
    "Trenching Alternative",
    "Water Line Installation",
    "Underground Power Lines",
    "Gas Line Installation",
    "Underground Internet Cable",
    "Fiber Optic Construction",
    "Fiber Splicing",
  ],
  image: "https://fibernorth.com/opengraph-image.png",
  priceRange: "$$",
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Hero */}
      <section className="relative py-24 sm:py-32 lg:py-44 overflow-hidden">
        <Image
          src="/images/hero-estate.jpg"
          alt="Northern Michigan home with an untouched lawn after underground utility installation by directional boring"
          fill
          className="object-cover object-bottom"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/40 to-transparent" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white">
              Bury a New Line Without
              <br />
              <span className="text-primary">Digging Up Your Yard</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-white/80">
              We drill underneath your lawn, trees, and driveway and pull the
              line through — water, power, gas, septic, or internet. Two small
              holes and we&apos;re gone. Serving Northern Michigan from
              Williamsburg.
            </p>
            <p className="mt-3 text-sm text-primary font-semibold uppercase tracking-wider">
              Typical 100 ft bore: $3,000, done in a day. Free estimates.
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

      {/* Trust Signals */}
      <section className="py-12 border-b border-border">
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

      {/* Cost Savings - The Big Message */}
      <section className="py-16 sm:py-24 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black">
              Think Trenching Is <span className="text-primary">Cheaper?</span>
            </h2>
            <p className="mt-3 text-lg text-muted-foreground max-w-2xl mx-auto">
              A trench for the same run typically costs $2,300&ndash;$6,000
              before you touch the restoration. Add it up, then compare.
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
                  Typically $2,300&ndash;$6,000, plus restoration, plus weeks
                  of waiting for grass
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
                  "In and out in a day or less",
                  "The yard in between stays put",
                  "Nothing to restore, reseed, or regrade",
                  "Irrigation lines stay untouched",
                  "Trees and landscaping stay intact",
                  "Driveways and sidewalks stay whole",
                  "Same price at nearly any depth",
                  "Your yard looks like we were never there",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm">
                    <span className="text-accent mt-0.5 font-bold">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 pt-4 border-t border-primary/20">
                <p className="text-sm font-semibold text-primary">
                  Typical 100 ft bore: $3,000. One price, done in a day.
                </p>
              </div>
            </div>
          </div>

          <p className="text-center text-muted-foreground mb-8">
            One more thing: a deeper trench costs more. A deeper bore
            doesn&apos;t. The price stays roughly the same at nearly any depth.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/contact"
              className="px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors text-lg shadow-lg"
            >
              Get a Free Quote
            </Link>
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
          alt="Home landscaping left intact after a trenchless underground line installation"
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
              A trench takes the lawn with it, and sometimes the sprinkler
              lines and tree roots too. A bore takes two small holes. We drill
              underneath your property at depth, and when we leave, your yard
              looks like we were never there.
            </p>
            <div className="mt-6 flex flex-wrap gap-4">
              <div className="bg-white/10 backdrop-blur rounded-lg px-4 py-3 border border-white/20">
                <p className="text-2xl font-black text-primary">$3,000</p>
                <p className="text-xs text-white/70">Typical 100 ft bore</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-lg px-4 py-3 border border-white/20">
                <p className="text-2xl font-black text-primary">1 Day</p>
                <p className="text-xs text-white/70">Most jobs done in a day or less</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-lg px-4 py-3 border border-white/20">
                <p className="text-2xl font-black text-primary">3 Days</p>
                <p className="text-xs text-white/70">Usual time to get scheduled</p>
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
                  href={`/services/${service.slug}`}
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

      {/* Who We Serve */}
      <section className="py-16 sm:py-20 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">
            Who We <span className="text-primary">Work With</span>
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden mb-4">
                <Image src="/images/house-garage.jpg" alt="Detached garage with buried power and water lines run without trenching" fill className="object-cover" />
              </div>
              <h3 className="text-lg font-bold">Homeowners</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Running water, power, gas, or internet to your garage, pole
                barn, or outbuilding — without tearing up your yard.
              </p>
            </div>
            <div className="text-center">
              <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden mb-4">
                <Image src="/images/construction-crew.jpg" alt="FiberNorth boring crew working with a contractor on a utility installation" fill className="object-cover" />
              </div>
              <h3 className="text-lg font-bold">Builders &amp; Contractors</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Need a boring sub? We show up on time with the right rig and
                get it done. No drama, no delays.
              </p>
            </div>
            <div className="text-center">
              <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden mb-4">
                <Image src="/images/pole-barn.jpg" alt="Pole barn with underground power and water lines installed by directional boring" fill className="object-cover" />
              </div>
              <h3 className="text-lg font-bold">Farmers</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Irrigation lines installed across fields with minimal
                disruption to your land and operation.
              </p>
            </div>
            <div className="text-center">
              <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden mb-4">
                <Image src="/images/construction-crew.jpg" alt="FiberNorth crew boring underground fiber optic mainline for an ISP build" fill className="object-cover" />
              </div>
              <h3 className="text-lg font-bold">ISPs &amp; Telecom</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Fiber construction is where we started — mainline, FTTP drops,
                blowing, and splicing.{" "}
                <Link href="/fiber-construction" className="text-primary font-medium hover:underline">
                  Fiber construction →
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-20 sm:py-24 overflow-hidden">
        <Image
          src="/images/backyard-trees.jpg"
          alt="Backyard with mature trees preserved by boring utilities underneath instead of trenching"
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-black text-white">
            Find Out What Your Job Would Cost
          </h2>
          <p className="mt-4 text-white/80 text-lg">
            Estimates are free and there&apos;s no obligation. Most jobs are
            scheduled within 3 days and done in a single day. Tell us where the
            line needs to go and we&apos;ll take it from there.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/contact"
              className="px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors text-lg shadow-lg"
            >
              Get a Free Quote
            </Link>
            <a
              href={`tel:+1${COMPANY.phone.replace(/[^0-9]/g, "")}`}
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
