import { Metadata } from "next";
import Link from "next/link";
import { Wifi, Cable, Radar, Building2, Phone, ArrowRight, Check } from "lucide-react";
import { COMPANY } from "@/lib/constants";

export const metadata: Metadata = {
  title: { absolute: "Fiber Construction Subcontractor | Northern Michigan" },
  description:
    "Fiber construction subcontractor for ISPs and telecoms: mainline boring, FTTP drops, conduit, blowing and splicing. 5 drills, Northern Michigan, since 2011.",
};

const capabilities = [
  {
    icon: Cable,
    title: "Mainline & Backbone",
    description:
      "Long-run directional boring for backbone and distribution, with pullback up to 10\" product. Our fleet includes rigs sized for multi-mile builds.",
  },
  {
    icon: Wifi,
    title: "FTTP Drops & Laterals",
    description:
      "Residential and commercial drops installed clean, under lawns, driveways, and landscaping. Property owners stay on your side.",
  },
  {
    icon: Radar,
    title: "Splicing & Blowing",
    description:
      "Fiber optic blowing equipment for long-distance installs, plus splicing.",
  },
  {
    icon: Building2,
    title: "Utility Coordination",
    description:
      "MISS DIG 811 compliant with a locating specialist on staff and hydrovac for potholing existing utilities before we drill.",
  },
];

const projects = [
  {
    title: "8-Mile Dual Fiber Backbone",
    detail:
      "Dual robust fiber networks connecting tribal complexes across the Grand Traverse region for the Grand Traverse Band.",
  },
  {
    title: "~25 Cell Tower Connections",
    detail:
      "Fiber connections to approximately 25 cell towers across Northern Michigan for a major carrier.",
  },
  {
    title: "Fiber to the Premises",
    detail:
      "FTTP throughout the historic Grand Traverse Commons development in Traverse City.",
  },
  {
    title: "Resort Campus Fiber",
    detail:
      "WiFi fiber infrastructure to condo buildings across the Grand Traverse Resort property.",
  },
];

export default function FiberConstructionPage() {
  return (
    <div className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="max-w-3xl mb-14">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-4">
            For ISPs, Telecoms &amp; Municipalities
          </p>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight">
            Fiber Construction Is Where We Started
          </h1>
          <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
            FiberNorth was founded in 2011 by the president of an ISP to build
            the underground infrastructure fiber internet needed in Northern
            Michigan. It&apos;s in the name. From mainline backbone to FTTP
            drops, we&apos;ve been putting fiber in the ground here for over a
            decade, on builds of every size.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4">
            <a
              href={`tel:+1${COMPANY.phone.replace(/[^0-9]/g, "")}`}
              className="flex items-center justify-center gap-2 px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Phone className="h-4 w-4" />
              Talk Builds: {COMPANY.phone}
            </a>
            <Link
              href="/contact"
              className="px-8 py-3 border border-border font-medium rounded-lg hover:bg-muted transition-colors text-center"
            >
              Request a Bid
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-accent" />
              Fully licensed &amp; insured
            </span>
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-accent" />
              MISS DIG 811 compliant
            </span>
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-accent" />
              5 drills + hydrovac, owned not rented
            </span>
          </div>
        </div>

        {/* Capabilities */}
        <div className="grid sm:grid-cols-2 gap-6 mb-16">
          {capabilities.map((cap) => (
            <div key={cap.title} className="bg-card border border-border rounded-xl p-7">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <cap.icon className="h-5 w-5 text-primary" />
                </div>
                <h2 className="font-bold">{cap.title}</h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {cap.description}
              </p>
            </div>
          ))}
        </div>

        {/* Track record */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-2">
            Fiber Work We&apos;ve <span className="text-primary">Put in the Ground</span>
          </h2>
          <p className="text-muted-foreground mb-8 max-w-2xl">
            A few of the larger builds. The full list, including scopes and
            locations, is on our projects page.
          </p>
          <div className="grid sm:grid-cols-2 gap-6">
            {projects.map((p) => (
              <div key={p.title} className="bg-card border border-border rounded-xl p-6">
                <h3 className="font-semibold mb-2">{p.title}</h3>
                <p className="text-sm text-muted-foreground">{p.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Why a sub matters */}
        <div className="bg-card border border-border rounded-xl p-8 sm:p-10 mb-16">
          <h2 className="text-2xl font-bold mb-4">
            A Boring Sub Who Understands Fiber
          </h2>
          <p className="text-muted-foreground max-w-3xl">
            We were built by fiber people, so we know what a make-ready delay
            costs you and why the drop count matters more than the footage. We
            show up with our own equipment, keep the schedule, and leave
            property owners happy. Multi-mile backbone or a neighborhood of
            drops, one call covers the bore, the blow, and the splice.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center bg-card border border-border rounded-xl p-10">
          <h2 className="text-2xl font-bold">Have a build coming up?</h2>
          <p className="mt-2 text-muted-foreground">
            Send us the scope and we&apos;ll get you a bid. Or just call — we
            answer.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/contact"
              className="px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors"
            >
              Request a Bid
            </Link>
            <a
              href={`tel:+1${COMPANY.phone.replace(/[^0-9]/g, "")}`}
              className="flex items-center gap-2 px-8 py-3 border border-border font-medium rounded-lg hover:bg-muted transition-colors"
            >
              <Phone className="h-4 w-4" />
              {COMPANY.phone}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
