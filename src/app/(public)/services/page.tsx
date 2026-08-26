import { Metadata } from "next";
import Link from "next/link";
import { SERVICES } from "@/lib/constants";
import { SERVICE_DETAILS } from "@/lib/service-content";
import {
  Droplets, Container, CloudRain, Zap, Flame, Sprout, Wifi, Route,
  ArrowRight,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Droplets, Container, CloudRain, Zap, Flame, Sprout, Wifi, Route,
};

export const metadata: Metadata = {
  title: "Trenchless Line Installation Services",
  description:
    "Water, septic, power, gas, drainage, irrigation and internet lines installed underground with no open trench. Northern Michigan. Free estimates.",
};

export default function ServicesPage() {
  return (
    <div className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            What We <span className="text-primary">Bury</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Water, power, gas, internet, drainage — if it belongs underground,
            we put it there without digging a trench. Your yard, driveway, and
            landscaping stay intact, and most jobs are done in a day.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {SERVICES.map((service) => {
            const Icon = iconMap[service.icon];
            const detail = SERVICE_DETAILS[service.slug];
            return (
              <Link
                key={service.slug}
                href={`/services/${service.slug}`}
                className="group bg-card border border-border rounded-xl p-7 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center gap-3 mb-4">
                  {Icon && (
                    <div className="w-11 h-11 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  <h2 className="text-lg font-bold">{service.name}</h2>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {detail?.description ?? service.shortDescription}
                </p>
                <span className="inline-flex items-center gap-2 mt-5 text-primary font-semibold text-sm">
                  Learn more
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </Link>
            );
          })}
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
