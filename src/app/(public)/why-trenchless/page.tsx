import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
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
  title: "Trenching vs. Boring: The Real Cost",
  description:
    "Trenching looks cheaper until you add up backfill, topsoil, seed and regrowth. A typical 100-ft bore runs $3,000 and is done in a day. See the math.",
  keywords: [
    "trenching vs boring",
    "cost to bury a line",
    "directional boring cost",
    "trenchless utility installation",
    "alternative to trenching",
    "Northern Michigan",
  ],
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How much does it cost to bore a utility line instead of trenching?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A typical 100-foot directional bore runs $3,000, one price for the whole job: drilling, pulling your line through, and cleanup. A comparable open trench realistically runs $2,300 to $6,000 once you add machine time, backfill, topsoil, and seed, plus months of regrowth. Free estimates, no obligation.",
      },
    },
    {
      "@type": "Question",
      name: "Is directional boring cheaper than digging a trench?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Often, yes — and almost always once you count restoration. Add driveway cuts, sprinkler repairs, backfill, topsoil, and seed, and the trench total lands between $2,300 and $6,000. A 100-foot bore is $3,000 with nothing to restore, because nothing gets torn up.",
      },
    },
    {
      "@type": "Question",
      name: "How long does directional boring take?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Most jobs are done in a day or less. We dig two small pits, bore the path, pull your line back through, fill the pits, and leave. Jobs are usually scheduled within 3 days of your call, after MISS DIG marking is complete.",
      },
    },
    {
      "@type": "Question",
      name: "Does boring tear up the yard?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. The only digging is two small pits, one where the drill enters and one where it exits. Everything between them stays untouched: lawn, trees, landscaping, and irrigation. We fill the pits when we're done, and your lawn looks like we were never there.",
      },
    },
    {
      "@type": "Question",
      name: "Can you bore under a driveway, septic field, or trees?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. That's the point of directional boring. The drill head travels underneath driveways, sidewalks, tree roots, septic tanks and drain fields, decks, and landscaping in a straight line. Nothing on the surface gets touched.",
      },
    },
    {
      "@type": "Question",
      name: "Does a deeper line cost more to install?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Not with boring. A deeper trench means a wider cut, more spoil to haul, and more money. A deeper bore costs about the same as a shallow one, so hitting frost depth for a water line doesn't change the bill.",
      },
    },
  ],
};

const trenchCosts = [
  {
    item: "Trencher or excavator & operator",
    detail: "Machine time and labor to open up 100 feet of trench",
    range: "$800 – $1,500",
  },
  {
    item: "Working around obstacles",
    detail:
      "Hand digging near tree roots, going the long way around the septic field, extra footage to get past the driveway",
    range: "$200 – $800",
  },
  {
    item: "Driveway or sidewalk crossing",
    detail: "Saw-cut, remove, and repour concrete or asphalt",
    range: "$500 – $1,500",
  },
  {
    item: "Irrigation line repairs",
    detail: "Trenchers find sprinkler lines the hard way, usually more than once",
    range: "$150 – $500",
  },
  {
    item: "Backfill, compaction, & grading",
    detail: "Filling it back in right, so it doesn't settle into a ditch next spring",
    range: "$300 – $600",
  },
  {
    item: "Topsoil, then seed or sod",
    detail: "New topsoil to finish grade, then seed or sod over the scar",
    range: "$350 – $1,100",
  },
  {
    item: "Weeks of watering & waiting",
    detail:
      "Daily watering and a dirt stripe across the lawn until the new grass fills in",
    range: "Your time, all summer",
  },
];

const timeline = {
  trench: [
    { period: "Day 1–2", event: "Trench gets cut across the yard. Dirt piled on the lawn." },
    { period: "Day 2–3", event: "Utility laid, inspection, backfill and compaction" },
    { period: "Week 1", event: "Topsoil hauled in, graded, seeded" },
    { period: "Weeks 2–8", event: "Daily watering. Bare dirt stripe. Stay off the lawn." },
    { period: "Month 2–3+", event: "New grass slowly blends in. The scar fades, eventually." },
  ],
  bore: [
    { period: "Morning", event: "We show up, dig two small pits, set up the drill" },
    { period: "Midday", event: "Bore the path underground, pull your line back through" },
    { period: "Afternoon", event: "Pits filled, site cleaned up, crew gone" },
    { period: "That evening", event: "Mow your lawn if you feel like it. You'd never know we were there." },
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
    bore: "In and out in a day or less",
  },
  {
    category: "Irrigation Risk",
    trench: "High risk of cutting sprinkler lines, requiring repair",
    bore: "We bore below irrigation depth — zero risk",
  },
  {
    category: "Depth",
    trench: "Deeper lines mean a wider, costlier trench and more spoil to haul",
    bore: "Nearly any depth for the same price — depth doesn't change the bill",
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
      "We fill the two small pits, clean up, and leave. Your lawn looks like we were never there.",
  },
];

export default function WhyTrenchlessPage() {
  return (
    <div className="py-16 sm:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            Need a Line Buried?{" "}
            <span className="text-primary">Skip the Trench.</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Most people don&apos;t know you can bury a water, power, gas, or
            internet line without digging up the yard. It&apos;s called
            directional boring, and here&apos;s the honest math on why it beats
            an open trench.
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
                  $2,300 – $6,000, plus months of looking at it
                </p>
              </div>
            </div>

            <div className="bg-primary/5 border-2 border-primary/20 rounded-lg p-5 sm:p-6">
              <div className="grid sm:grid-cols-[1fr_auto] gap-2 sm:gap-6 items-center">
                <div>
                  <p className="font-bold">
                    The same 100-foot pipe, directionally bored
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    One price covers drilling, install, and cleanup, at nearly
                    any depth. Nothing gets torn up, so there&apos;s nothing to
                    restore.
                  </p>
                </div>
                <p className="font-bold text-primary sm:text-right whitespace-nowrap text-lg">
                  $3,000, done in a day or less
                </p>
              </div>
            </div>

            <p className="text-lg font-medium mt-6">
              That lands right in the middle of what the trench really costs.
              And you skip the torn-up yard entirely.
            </p>
            <p className="text-xs text-muted-foreground mt-4">
              Trench figures are illustrative, based on typical Northern
              Michigan costs. Every property is different — that&apos;s why the
              estimate is free.
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
                  <Check className="h-5 w-5 text-accent shrink-0 mt-0.5" />
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
            There&apos;s one cost nobody puts on the invoice: how long your yard
            looks like a construction site.
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
                One day, and your yard is yours again.
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
                  An open trench needs a clear path from point A to point B, and
                  in a real yard that path almost never exists. So the trench
                  winds around things, and every detour adds footage, labor,
                  and risk. Or it goes straight through them.
                </p>
                <p className="font-medium">
                  We just go underneath all of it, in a straight line. The run is
                  shorter and nothing on the surface gets touched.
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

        {/* What a real job looks like */}
        <section className="mb-20">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-3">
            What a Finished Job Actually Looks Like
          </h2>
          <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-10">
            A recent one: a failing water line from the well to the house,
            replaced by boring under a side hill — past the gas line, the old
            water line, and the deck. This is all the &ldquo;digging&rdquo; the
            yard ever saw.
          </p>
          <div className="grid sm:grid-cols-2 gap-6">
            <figure className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="relative aspect-[4/3]">
                <Image
                  src="/images/jobs/waterline-exit-yard.jpg"
                  alt="Yard with the wellhead circled near the driveway and the bore exit point in the lawn — no trench between them"
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, 50vw"
                />
              </div>
              <figcaption className="p-4 text-sm text-muted-foreground">
                The run started at the well (circled) and ended at the house.
                Everything between stayed exactly as you see it.
              </figcaption>
            </figure>
            <figure className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="relative aspect-[4/3]">
                <Image
                  src="/images/jobs/waterline-pullback-slot.jpg"
                  alt="New water line emerging through a narrow slot in an otherwise untouched lawn"
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, 50vw"
                />
              </div>
              <figcaption className="p-4 text-sm text-muted-foreground">
                The new line comes up through a slot you could cover with a
                boot. That&apos;s the whole excavation.
              </figcaption>
            </figure>
            <figure className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="relative aspect-[4/3]">
                <Image
                  src="/images/jobs/waterline-pit-at-house.jpg"
                  alt="Small connection pit beside the house foundation with the deck protected by a tarp"
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, 50vw"
                />
              </div>
              <figcaption className="p-4 text-sm text-muted-foreground">
                One small pit at the house to make the connection — spoil on a
                tarp, deck untouched.
              </figcaption>
            </figure>
            <figure className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="relative aspect-[4/3]">
                <Image
                  src="/images/jobs/waterline-hillside-landscaping.jpg"
                  alt="Wooded hillside with landscaping intact while the bore passes underneath"
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, 50vw"
                />
              </div>
              <figcaption className="p-4 text-sm text-muted-foreground">
                The bore ran under this hillside. The plantings, boulder, and
                ground cover never knew we were there.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* Key Benefits */}
        <section className="mb-20">
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <Clock className="h-10 w-10 text-primary mx-auto mb-4" />
              <h3 className="text-lg font-bold mb-2">Done in Hours</h3>
              <p className="text-sm text-muted-foreground">
                Most jobs are done in a day or less, scheduled within 3 days
                of your call.
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
            Free estimates, no obligation. We&apos;ll show you exactly how your
            line goes in without a trench.
          </p>
          <Link
            href="/contact"
            className="inline-block mt-6 px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 transition-colors"
          >
            Get a Free Quote
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">
            Still have questions? Check the{" "}
            <Link href="/faq" className="text-primary hover:underline">
              FAQ
            </Link>{" "}
            for answers on cost, depth, MISS DIG, and scheduling.
          </p>
        </section>
      </div>
    </div>
  );
}
