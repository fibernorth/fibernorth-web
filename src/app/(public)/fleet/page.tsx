import { Metadata } from "next";
import Image from "next/image";
import { FLEET as FALLBACK_FLEET } from "@/lib/constants";
import { Truck } from "lucide-react";
import { getActiveEquipment } from "@/lib/server-data";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Our Directional Drills & Equipment Fleet",
  description:
    "5 directional drills sized for any business, utility, or homeowner project — pulling back product up to 10 inches in diameter. Plus a full support fleet.",
};

export default async function FleetPage() {
  const firestoreFleet = await getActiveEquipment();

  // Use Firestore data if available, otherwise fall back to constants
  const useFirestore = firestoreFleet.length > 0;
  const equipment = useFirestore
    ? firestoreFleet
    : FALLBACK_FLEET.map((e, i) => ({
        ...e,
        id: `${e.model}-${i}`,
        name: `${e.manufacturer} ${e.model}`,
        description: "",
        image: "",
        isActive: true,
        sortOrder: i,
      }));

  const drills = equipment.filter(
    (e) =>
      e.manufacturer === "Vermeer" &&
      (e.model.includes("x") || e.model.includes("X")) &&
      !e.model.includes("Hydro")
  );

  const support = equipment.filter((e) => !drills.includes(e));

  return (
    <div className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            Our <span className="text-primary">Fleet</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            We own and maintain every machine on this page. That means the
            right drill for your job, ready when your job is — never waiting
            on a rental yard.
          </p>
        </div>

        {/* The Simple Version */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          <div className="bg-card border border-border rounded-lg p-6 text-center">
            <p className="text-4xl font-black text-primary">5</p>
            <p className="font-semibold mt-1">Directional Drills</p>
            <p className="text-sm text-muted-foreground mt-2">
              A compact rig for a tight backyard, a bigger one for a long run.
              Not whatever happened to be free that day.
            </p>
          </div>
          <div className="bg-card border border-border rounded-lg p-6 text-center">
            <p className="text-4xl font-black text-primary">10&quot;</p>
            <p className="font-semibold mt-1">Max Product Diameter</p>
            <p className="text-sm text-muted-foreground mt-2">
              Pipe and conduit up to 10 inches — big enough for water, sewer,
              electric, or a full conduit bank
            </p>
          </div>
          <div className="bg-card border border-border rounded-lg p-6 text-center">
            <p className="text-4xl font-black text-primary">Any</p>
            <p className="font-semibold mt-1">Size of Project</p>
            <p className="text-sm text-muted-foreground mt-2">
              A 50-foot run to your garage gets the same crew and care as a
              utility build. No job is too small to schedule.
            </p>
          </div>
          <div className="bg-card border border-border rounded-lg p-6 text-center">
            <p className="text-4xl font-black text-primary">Hydrovac</p>
            <p className="font-semibold mt-1">On Every Tough Job</p>
            <p className="text-sm text-muted-foreground mt-2">
              Before we drill near your gas, water, or septic lines, the
              hydrovac exposes them so we see them instead of guessing
            </p>
          </div>
        </div>

        {/* Directional Drills */}
        {drills.length > 0 && (
          <div className="mb-12">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <span className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center">
                <Truck className="h-4 w-4 text-primary" />
              </span>
              Directional Drills
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {drills.map((e, i) => (
                <div
                  key={`${e.id}-${i}`}
                  className="bg-card border border-border rounded-lg overflow-hidden"
                >
                  {e.image ? (
                    <div className="relative aspect-video">
                      <Image
                        src={e.image}
                        alt={`${e.manufacturer} ${e.model}`}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    </div>
                  ) : null}
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold">
                        {e.manufacturer} {e.model}
                      </h3>
                      {e.year > 0 && (
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                          {e.year}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {e.capability}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Support Equipment */}
        {support.length > 0 && (
          <div>
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <span className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center">
                <Truck className="h-4 w-4 text-primary" />
              </span>
              Support Equipment
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {support.map((e, i) => (
                <div
                  key={`${e.id}-${i}`}
                  className="bg-card border border-border rounded-lg overflow-hidden"
                >
                  {e.image ? (
                    <div className="relative aspect-video">
                      <Image
                        src={e.image}
                        alt={`${e.manufacturer} ${e.model}`}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    </div>
                  ) : null}
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold">
                        {e.manufacturer} {e.model}
                      </h3>
                      {e.year > 0 && (
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                          {e.year}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {e.capability}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-12 bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-lg font-semibold">
            The right machine for your job. One phone call.
          </p>
          <p className="text-muted-foreground mt-2">
            A 50-foot residential bore or a multi-mile utility run — we show
            up with the drill that fits.
          </p>
        </div>
      </div>
    </div>
  );
}
