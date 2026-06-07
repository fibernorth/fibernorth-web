import { Metadata } from "next";
import Link from "next/link";
import { Check, X, Clock, DollarSign, TreePine, Shovel, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Why Trenchless?",
  description:
    "Learn why trenchless directional boring is better than open trenching. Less damage, faster completion, and often more cost-effective when you factor in restoration.",
};

const comparison = [
  {
    category: "Yard Damage",
    trench: "Full-width trench destroys grass, landscaping, and root systems",
    bore: "Two small holes at entry and exit — nothing in between",
  },
  {
    category: "Trees & Landscaping",
    trench: "Roots are cut, plants are destroyed, trees may die",
    bore: "We bore underneath — root systems stay completely intact",
  },
  {
    category: "Driveways & Sidewalks",
    trench: "Must be cut, removed, and replaced at additional cost",
    bore: "We bore underneath — surfaces are never touched",
  },
  {
    category: "Restoration Needed",
    trench: "Backfill, compaction, topsoil, seed, and months of regrowth",
    bore: "None. Fill two small holes and you're done",
  },
  {
    category: "Time on Your Property",
    trench: "Days of excavation plus weeks/months of restoration",
    bore: "In and out in hours. Most jobs completed in a single day",
  },
  {
    category: "Irrigation Risk",
    trench: "High risk of cutting sprinkler lines, requiring repair",
    bore: "We bore below irrigation depth — zero risk",
  },
  {
    category: "Weather Dependence",
    trench: "Muddy conditions make trenching messy and slow",
    bore: "Our equipment operates in any weather, year-round",
  },
];

const steps = [
  {
    num: "1",
    title: "Call & Schedule",
    description:
      "You call us, describe the job. We schedule after MISS DIG markings are complete — usually 3 business days.",
  },
  {
    num: "2",
    title: "Setup",
    description:
      "We arrive with the drill rig, dig a small entry pit and an exit pit. That's the only digging that happens.",
  },
  {
    num: "3",
    title: "Bore",
    description:
      "The drill head goes underground at a shallow angle, follows a precise path at the right depth, and surfaces at the exit point.",
  },
  {
    num: "4",
    title: "Pullback",
    description:
      "We attach your pipe, conduit, or cable to the drill string and pull it back through the bore hole. The utility is now installed underground.",
  },
  {
    num: "5",
    title: "Cleanup",
    description:
      "We fill the two small pits, clean up, and leave. Your yard looks like we were never there.",
  },
];

export default function WhyTrenchlessPage() {
  return (
    <div className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            Why <span className="text-primary">Trenchless?</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Most people don&apos;t know you can install underground utilities
            without digging a trench. Here&apos;s why directional boring is the
            smarter choice.
          </p>
        </div>

        {/* The Problem */}
        <section className="mb-20">
          <div className="bg-card border border-border rounded-lg p-8 sm:p-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              Think Trenching Is Cheaper?{" "}
              <span className="text-primary">Add It Up.</span>
            </h2>
            <p className="text-muted-foreground text-lg mb-6">
              A 100-foot open trench through your yard requires a trencher,
              labor to dig, labor to fill it back in, new topsoil, seed, and
              time for it to grow back. If they hit your irrigation system,
              add that repair too. And you&apos;re looking at a scar across
              your lawn for months.
            </p>
            <p className="text-lg font-medium">
              With directional boring, we&apos;re in and out in hours. Two
              small holes on each end. No damage in the middle. No restoration.
              Done.
            </p>
          </div>
        </section>

        {/* Comparison Table */}
        <section className="mb-20">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">
            Trench vs. Bore — Side by Side
          </h2>
          <div className="space-y-4">
            {comparison.map((item) => (
              <div
                key={item.category}
                className="grid md:grid-cols-[200px_1fr_1fr] gap-4 bg-card border border-border rounded-lg p-5"
              >
                <div className="font-semibold text-sm flex items-center">
                  {item.category}
                </div>
                <div className="flex items-start gap-3">
                  <X className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <span className="text-sm text-muted-foreground">
                    {item.trench}
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{item.bore}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How It Works */}
        <section className="mb-20">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">
            How Directional Boring Works
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {steps.map((step, i) => (
              <div key={step.num} className="relative">
                <div className="bg-card border border-border rounded-lg p-5 h-full">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm mb-3">
                    {step.num}
                  </div>
                  <h3 className="font-semibold mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {step.description}
                  </p>
                </div>
                {i < steps.length - 1 && (
                  <ArrowRight className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/30" />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Key Benefits */}
        <section className="mb-20">
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <Clock className="h-10 w-10 text-primary mx-auto mb-4" />
              <h3 className="text-lg font-bold mb-2">Done in Hours</h3>
              <p className="text-sm text-muted-foreground">
                Most residential jobs are completed in a single day. Scheduled
                within 3 days of your call.
              </p>
            </div>
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <TreePine className="h-10 w-10 text-primary mx-auto mb-4" />
              <h3 className="text-lg font-bold mb-2">Zero Yard Damage</h3>
              <p className="text-sm text-muted-foreground">
                Your lawn, trees, landscaping, driveways, and irrigation stay
                completely untouched.
              </p>
            </div>
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <DollarSign className="h-10 w-10 text-primary mx-auto mb-4" />
              <h3 className="text-lg font-bold mb-2">Real Cost Savings</h3>
              <p className="text-sm text-muted-foreground">
                No restoration costs, no irrigation repairs, no waiting. When
                you add it all up, boring often costs less.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="text-center bg-card border border-border rounded-lg p-10">
          <h2 className="text-2xl font-bold">
            Ready to Keep Your Yard Intact?
          </h2>
          <p className="mt-2 text-muted-foreground">
            Get a free estimate. We&apos;ll show you exactly how we can install
            your utility without digging a trench.
          </p>
          <Link
            href="/contact"
            className="inline-block mt-6 px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 transition-colors"
          >
            Get a Free Quote
          </Link>
        </section>
      </div>
    </div>
  );
}
