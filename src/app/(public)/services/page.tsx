"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { SERVICES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  Droplets, Container, CloudRain, Zap, Flame, Sprout, Wifi, Route,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Droplets, Container, CloudRain, Zap, Flame, Sprout, Wifi, Route,
};

const serviceDetails: Record<string, { description: string; features: string[] }> = {
  "water-lines": {
    description:
      "Need water to your new garage, pole barn, or outbuilding? We bore underground water lines without disturbing your yard, driveway, or landscaping. No trench, no mess, no weeks of restoration.",
    features: [
      "Residential water line extensions",
      "Well line connections to new structures",
      "Water main connections",
      "Service lines under driveways and roads",
    ],
  },
  septic: {
    description:
      "Septic line installations and pump-up systems bored underground with precision. We work with your septic installer to get the line exactly where it needs to go — without digging up your entire yard.",
    features: [
      "Septic tank to drain field connections",
      "Pump-up system installations",
      "Septic line replacements",
      "Force main installations",
    ],
  },
  drainage: {
    description:
      "Water problems around your building? We install underground drainage systems to move water away from foundations, basements, and low areas. Solve the problem underground where it belongs.",
    features: [
      "Foundation drainage systems",
      "Yard drainage solutions",
      "Downspout underground routing",
      "French drain installations",
    ],
  },
  power: {
    description:
      "Run power to your outbuilding, pole barn, shop, or new construction without trenching across your property. We bore conduit underground for your electrician to pull wire through.",
    features: [
      "Power conduit to outbuildings",
      "Underground service entrances",
      "Conduit under driveways and roads",
      "Generator transfer switch connections",
    ],
  },
  gas: {
    description:
      "Gas line installations bored underground for propane and natural gas service. We install the conduit or direct-bury line from your meter or tank to wherever you need it.",
    features: [
      "Propane line extensions",
      "Natural gas service lines",
      "Gas line to outbuildings",
      "New construction gas service",
    ],
  },
  irrigation: {
    description:
      "Irrigation line installations for farms, golf courses, sports fields, and large properties. Our equipment handles long runs efficiently with minimal disruption to your operation.",
    features: [
      "Agricultural irrigation mains",
      "Golf course irrigation",
      "Sports field irrigation",
      "Large property sprinkler mains",
    ],
  },
  fiber: {
    description:
      "Want internet in your pole barn or shop? We bore fiber optic cable or conduit from your house to any outbuilding on your property. Same internet speed, no trenching.",
    features: [
      "Fiber to pole barns and shops",
      "Cable/ethernet to outbuildings",
      "Conduit for future runs",
      "Multi-building connections",
    ],
  },
  "culvert-driveway": {
    description:
      "Need to cross under a driveway, road, or culvert without cutting? We bore underneath and leave the surface completely untouched. No saw-cutting, no patching, no waiting for asphalt.",
    features: [
      "Driveway crossings",
      "Road crossings",
      "Culvert installations",
      "Sidewalk and patio crossings",
    ],
  },
};

export default function ServicesPage() {
  const [activeSlug, setActiveSlug] = useState<string>(SERVICES[0].slug);

  // Handle hash in URL on load
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash && SERVICES.some((s) => s.slug === hash)) {
      setActiveSlug(hash);
    }
  }, []);

  const activeService = SERVICES.find((s) => s.slug === activeSlug)!;
  const details = serviceDetails[activeSlug];
  const Icon = iconMap[activeService.icon];

  return (
    <div className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            Our <span className="text-primary">Services</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Underground utility installations done right — with directional
            drilling and trenchless technology that keeps your property intact.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {SERVICES.map((service) => {
            const TabIcon = iconMap[service.icon];
            const isActive = service.slug === activeSlug;
            return (
              <button
                key={service.slug}
                onClick={() => {
                  setActiveSlug(service.slug);
                  window.history.replaceState(null, "", `#${service.slug}`);
                }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
                )}
              >
                {TabIcon && <TabIcon className="h-4 w-4" />}
                {service.name}
              </button>
            );
          })}
        </div>

        {/* Active Service Detail */}
        <div className="bg-card border border-border rounded-xl p-8 sm:p-10">
          <div className="grid md:grid-cols-[1fr_320px] gap-8">
            <div>
              <div className="flex items-center gap-3 mb-5">
                {Icon && (
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                )}
                <h2 className="text-2xl sm:text-3xl font-bold">
                  {activeService.name}
                </h2>
              </div>
              <p className="text-muted-foreground text-lg leading-relaxed">
                {details?.description}
              </p>
              <Link
                href="/contact"
                className="inline-block mt-8 px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
              >
                Get a Quote for {activeService.name}
              </Link>
            </div>

            <div className="bg-muted/50 rounded-lg p-6">
              <h3 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wider">
                What we install
              </h3>
              <ul className="space-y-3">
                {details?.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-3 text-sm"
                  >
                    <span className="text-primary mt-0.5 font-bold">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-16 text-center bg-card border border-border rounded-xl p-10">
          <h2 className="text-2xl font-bold">Not sure what you need?</h2>
          <p className="mt-2 text-muted-foreground">
            Tell us what you&apos;re trying to accomplish and we&apos;ll figure
            out the best approach. Free estimates, no obligation.
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
