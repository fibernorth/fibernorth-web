import { Metadata } from "next";
import Link from "next/link";
import ServiceAreaMap from "@/components/service-area-map";

export const metadata: Metadata = {
  title: "Service Area",
  description:
    "FiberNorth Underground serves Northern Michigan within 2 hours of Williamsburg, MI. Preferred service within 1 hour. Traverse City, Petoskey, Cadillac, and surrounding areas.",
};

const primaryAreas = [
  "Traverse City",
  "Williamsburg",
  "Elk Rapids",
  "Suttons Bay",
  "Leland",
  "Interlochen",
  "Kingsley",
  "Kalkaska",
  "Acme",
  "Bellaire",
  "Mancelona",
  "Lake Ann",
];

const extendedAreas = [
  "Petoskey",
  "Charlevoix",
  "Boyne City",
  "Gaylord",
  "Cadillac",
  "Manistee",
  "Frankfort",
  "Beulah",
  "Grayling",
  "Houghton Lake",
  "Reed City",
  "Big Rapids",
];

export default function ServiceAreaPage() {
  return (
    <div className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            Service <span className="text-primary">Area</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Based in Williamsburg, MI — serving Northern Michigan within a
            2-hour radius.
          </p>
        </div>

        {/* Map */}
        <div className="bg-card border border-border rounded-lg p-4 mb-4">
          <ServiceAreaMap />
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 text-sm mb-12">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-primary rounded-full" />
            <span className="text-muted-foreground">Primary (within 1 hr)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-secondary rounded-full" />
            <span className="text-muted-foreground">Extended (1-2 hrs)</span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Primary Zone */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-4 h-4 bg-primary rounded-full" />
              <h2 className="text-xl font-bold">
                Primary Service Area (within 1 hour)
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Standard pricing. This is our sweet spot — we can mobilize
              quickly and handle any issues same-day.
            </p>
            <div className="flex flex-wrap gap-2">
              {primaryAreas.map((area) => (
                <span
                  key={area}
                  className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full"
                >
                  {area}
                </span>
              ))}
            </div>
          </div>

          {/* Extended Zone */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-4 h-4 bg-secondary rounded-full" />
              <h2 className="text-xl font-bold">
                Extended Service Area (1-2 hours)
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              We absolutely serve these areas — just with a small travel premium
              to account for additional mobilization time.
            </p>
            <div className="flex flex-wrap gap-2">
              {extendedAreas.map((area) => (
                <span
                  key={area}
                  className="text-xs bg-secondary/10 text-secondary px-2.5 py-1 rounded-full"
                >
                  {area}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-12 text-center">
          <p className="text-muted-foreground mb-4">
            Not sure if you&apos;re in our service area? Just ask.
          </p>
          <Link
            href="/contact"
            className="inline-block px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 transition-colors"
          >
            Contact Us
          </Link>
        </div>
      </div>
    </div>
  );
}
