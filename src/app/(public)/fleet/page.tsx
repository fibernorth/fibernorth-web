import { Metadata } from "next";
import Image from "next/image";
import { FLEET as FALLBACK_FLEET } from "@/lib/constants";
import { Truck } from "lucide-react";
import { getActiveEquipment } from "@/lib/server-data";

export const metadata: Metadata = {
  title: "Our Fleet",
  description:
    "FiberNorth Underground operates a fleet of 6 directional drills, excavators, a vibratory plow, track loader, and hydrovac — not a one-rig operation.",
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

  const drills = equipment.filter((e) => {
    if (useFirestore) {
      // Firestore equipment: filter by manufacturer Vermeer and model containing x/X but not Hydro
      const name = `${e.manufacturer} ${e.model}`;
      return (
        e.manufacturer === "Vermeer" &&
        (e.model.includes("x") || e.model.includes("X")) &&
        !e.model.includes("Hydro")
      );
    }
    return (
      e.manufacturer === "Vermeer" &&
      (e.model.includes("x") || e.model.includes("X")) &&
      !e.model.includes("Hydro")
    );
  });

  const support = equipment.filter((e) => !drills.includes(e));

  return (
    <div className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            Our <span className="text-primary">Fleet</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            We own and maintain our equipment — no rentals, no excuses. With{" "}
            {drills.length} directional drills and a full support fleet, we have
            the right machine for every job.
          </p>
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
            {equipment.length} machines. One phone call.
          </p>
          <p className="text-muted-foreground mt-2">
            We match the right equipment to your job — whether it&apos;s a
            50-foot residential bore or a multi-mile fiber run.
          </p>
        </div>
      </div>
    </div>
  );
}
