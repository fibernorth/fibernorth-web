import { Metadata } from "next";
import Link from "next/link";
import {
  Check,
  X,
  Clock,
  DollarSign,
  TreePine,
  ArrowRight,
  CalendarDays,
  Ban,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Why Trenchless?",
  description:
    "Trenching looks cheap until you add it up: digging, dodging obstacles, backfill, topsoil, seed, and months of regrowth. See the real math on directional boring vs. open trenching.",
};

const trenchCosts = [
  {
    item: "Trencher or excavator + operator",
    detail: "Machine time and labor to open 100 feet of trench",
    range: "$800 – $1,500",
  },
  {
    item: "Working around obstacles",
    detail:
      "Hand-digging near trees, rerouting around the septic field, extra footage to dodge the driveway",
    range: "$200 – $800",
  },
  {
    item: "Driveway or sidewalk crossing",
    detail: "Saw-cut, remove, and repour concrete or asphalt",
    range: "$500 – $1,500",
  },
  {
    item: "Irrigation line repairs",
    detail: "Trenchers find sprinkler lines the hard way — often more than one",
    range: "$150 – $500",
  },
  {
    item: "Backfill, compaction & grading",
    detail: "Filling it back in properly so it doesn't settle into a ditch",
    range: "$300 – $600",
  },
  {
    item: "Topsoil, seed or sod",
    detail: "New topsoil to finish grade, then seed or sod over the scar",
    range: "$350 – $1,100",
  },
  {
    item: "Weeks of watering & waiting",
    detail:
      "Daily watering, roped-off lawn, and a visible stripe until the grass fills in",
    range: "Your time, all summer",
  },
];

const timeline = {
  trench: [
    { period: "Day 1–2", event: "Excavation — trench cut across the yard, dirt piled on the lawn" },
    { period: "Day 2–3", event: "Utility laid, inspection, backfill and compaction" },
    { period: "Week 1", event: "Topsoil hauled in, graded, seeded" },
    { period: "Weeks 2–8", event: "Daily watering. Bare dirt stripe. Stay off the lawn." },
    { period: "Month 2–3+", event: "New grass slowly blends in — the scar fades, eventually" },
  ],
  bore: [
    { period: "Morning", event: "We arrive, dig two small pits, set up the drill rig" },
    { period: "Midday", event: "Bore the path underground, pull your line back through" },
    { period: "Afternoon", event: "Pits filled, site cleaned up, crew gone" },
    { period: "That evening", event: "Mow your lawn if you feel like it" },
  ],
};

const obstacles = [
  "Mature trees and their root systems",
  "Driveways and sidewalks",
  "Septic tanks and drain fields",
  "Flower beds and landscaping",
  "Irrigation and sprinkler grids",
  "Decks, patios, and fences",
];

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

        {/* The Real Math */}
        <section className="mb-20">
          <div className="bg-card border border-border rounded-lg p-8 sm:p-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              Think Trenching Is Cheaper?{" "}
              <span className="text-primary">Actually Add It Up.</span>
            </h2>
            <p className="text-muted-foreground text-lg mb-8">
              The trencher quote is only the first line item. Here&apos;s what a
              typical 100-foot open trench through an established lawn really
              involves, start to finish:
            </p>

            <div className="border border-border rounded-lg overflow-hidden mb-6">
              {trenchCosts.map((row, i) => (
                <div
                  key={row.item}
                  className={`grid sm:grid-cols-[1fr_auto] gap-2 sm:gap-6 p-4 sm:p-5 ${
                    i > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <div>
                    <p className="font-semibold text-sm">{row.item}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {row.detail}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-destructive sm:text-right whitespace-nowrap">
                    {row.range}
                  </p>
                </div>
              ))}
              <div className="grid sm:grid-cols-[1fr_auto] gap-2 sm:gap-6 p-4 sm:p-5 border-t-2 border-destructive/30 bg-destructive/5">
                <p className="font-bold">The real trench total</p>
                <p className="font-bold text-destructive sm:text-right whitespace-nowrap">
                  $2,300 – $6,000 + months of eyesore
                </p>
              </div>
            </div>

            <div className="bg-primary/5 border-2 border-primary/20 rounded-lg p-5 sm:p-6">
              <div className="grid sm:grid-cols-[1fr_auto] gap-2 sm:gap-6 items-center">
                <div>
                  <p className="font-bold">Directional bore</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    One quoted price that covers everything — drilling, install,
                    and cleanup. There is nothing to restore, so there is
                    nothing else to pay for.
                  </p>
                </div>
                <p className="font-bold text-primary sm:text-right whitespace-nowrap">
                  Usually right in that range — or less
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-4">
              Illustrative example based on typical Northern Michigan costs.
              Every property is different — that&apos;s why the estimate is
              free.
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

        {/* Timeline Comparison */}
        <section className="mb-20">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-3">
            Your Next Three Months,{" "}
            <span className="text-primary">Two Ways</span>
          </h2>
          <p className="text-center text-muted-foreground mb-10 max-w-2xl mx-auto">
            The cost you can&apos;t put on an invoice: how long your yard is a
            construction site.
          </p>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-destructive/5 border-2 border-destructive/20 rounded-xl p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <CalendarDays className="h-6 w-6 text-destructive" />
                <h3 className="text-xl font-bold">Open Trench</h3>
              </div>
              <ol className="space-y-4">
                {timeline.trench.map((step) => (
                  <li key={step.period} className="flex gap-4">
                    <span className="text-sm font-bold text-destructive w-24 shrink-0">
                      {step.period}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {step.event}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="bg-primary/5 border-2 border-primary/20 rounded-xl p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <Clock className="h-6 w-6 text-primary" />
                <h3 className="text-xl font-bold">Directional Bore</h3>
              </div>
              <ol className="space-y-4">
                {timeline.bore.map((step) => (
                  <li key={step.period} className="flex gap-4">
                    <span className="text-sm font-bold text-primary w-24 shrink-0">
                      {step.period}
                    </span>
                    <span className="text-sm">{step.event}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-6 pt-4 border-t border-primary/20 text-sm font-semibold text-primary">
                One day. Then your yard is yours again.
              </p>
            </div>
          </div>
        </section>

        {/* Obstacles */}
        <section className="mb-20">
          <div className="bg-card border border-border rounded-lg p-8 sm:p-10">
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  A Trench Has to Go <span className="text-primary">Around</span>.
                  We Go <span className="text-primary">Under</span>.
                </h2>
                <p className="text-muted-foreground mb-4">
                  An open trench needs a clear path from point A to point B. In
                  a real yard, that path rarely exists — so the trench detours
                  around obstacles, adding footage, labor, and risk with every
                  turn. Or worse, it goes straight through them.
                </p>
                <p className="font-medium">
                  A directional bore travels underneath all of it in a straight
                  line. Shorter runs, no detours, nothing on the surface
                  touched.
                </p>
              </div>
              <ul className="grid sm:grid-cols-2 gap-3">
                {obstacles.map((obstacle) => (
                  <li
                    key={obstacle}
                    className="flex items-center gap-3 bg-background border border-border rounded-lg px-4 py-3"
                  >
                    <Ban className="h-4 w-4 text-destructive shrink-0" />
                    <span className="text-sm">{obstacle}</span>
                  </li>
                ))}
              </ul>
            </div>
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
