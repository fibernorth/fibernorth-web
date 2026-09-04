import { Metadata } from "next";
import { Phone, Check, Drill, Handshake, Timer, Radar } from "lucide-react";
import { COMPANY } from "@/lib/constants";

export const metadata: Metadata = {
  title: { absolute: "For Contractors | Sub Your Bores or Refer Them | FiberNorth Underground" },
  description:
    "Excavators, electricians, well drillers, plumbers: sub your bores to us and mark them up, or hand them off for a 10% commission. Dedicated crews, fast mobilization, Northern Michigan.",
};

const money = [
  {
    icon: Handshake,
    title: "Sub It and Mark It Up",
    description:
      "Sub the bore to us and add your usual percentage. Customer's yours, markup's yours. We show up, do our piece, and leave.",
  },
  {
    icon: Check,
    title: "Hand It Off for 10%",
    description:
      "Some jobs you just don't want. Hand them to us and take 10% as a commission. One call and we handle everything else. You get a check when it's done.",
  },
  {
    icon: Timer,
    title: "Longer Runs Can Pay Better Bored",
    description:
      "On longer runs, a bore can sometimes carry more margin for you than excavating the same footage, and it's done quicker with almost no restoration. You finish sooner, the yard survives, and the customer remembers you for it.",
  },
];

const why = [
  "This is all we do. Most drilling companies treat small bores as unwanted side work and get to them when they get to them.",
  "We can usually be out within about 3 days of the MISS DIG marks, so your schedule holds.",
  "Five drills with pullback up to 10 inches, our own hydrovac, and our own locating crew that finds private utilities and double-checks the MISS DIG marks.",
  "We stay in our lane and we don't chase your customers after.",
];

export default function ForContractorsPage() {
  return (
    <div className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="max-w-3xl mb-14">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-4">
            For Excavators, Electricians, Well Drillers, Plumbers &amp; Builders
          </p>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight">
            The Boring Company You Call First
          </h1>
          <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
            When a job needs to get under a driveway, a finished lawn, or a
            row of mature trees, you shouldn&apos;t have to trench the long
            way around or give the work away. Sub the bore to us, or hand the
            job off and get paid for the referral. Either way the call is
            worth money to you.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4">
            <a
              href={`tel:+1${COMPANY.phone.replace(/[^0-9]/g, "")}`}
              className="flex items-center justify-center gap-2 px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Phone className="h-4 w-4" />
              Call {COMPANY.phone}, Ask for Bill
            </a>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-accent" />
              Dedicated boring crews
            </span>
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-accent" />
              Fast mobilization
            </span>
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-accent" />
              Your customer stays yours
            </span>
          </div>
        </div>

        {/* Money */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-2">
            Three Ways the Call <span className="text-primary">Pays You</span>
          </h2>
          <p className="text-muted-foreground mb-8 max-w-2xl">
            Mark us up, take the commission, or both. We&apos;re not picky
            about how you get paid. We just want the call.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            {money.map((m) => (
              <div key={m.title} className="bg-card border border-border rounded-xl p-7">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <m.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-bold">{m.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{m.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Why us */}
        <div className="bg-card border border-border rounded-xl p-8 sm:p-10 mb-16">
          <div className="flex items-center gap-3 mb-4">
            <Drill className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Why Us and Not the Other Guys</h2>
          </div>
          <ul className="space-y-3 max-w-3xl">
            {why.map((w) => (
              <li key={w} className="flex gap-3 text-muted-foreground">
                <Check className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Scope */}
        <div className="bg-card border border-border rounded-xl p-8 sm:p-10 mb-16">
          <div className="flex items-center gap-3 mb-4">
            <Radar className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">What We Get Under</h2>
          </div>
          <p className="text-muted-foreground max-w-3xl">
            Driveways, finished lawns, septic fields, tree lines, roads,
            or just a long run that would be expensive excavating and
            cleaning up. Water, power, gas, sewer, drainage (to grade),
            conduit, and fiber lines. We can exit in a crawl space or a
            basement, or come straight through a cement or block wall, so
            the line lands where the connection actually is. If the route
            crosses something you can&apos;t open-cut, we get under it, and
            your customer&apos;s place looks the way you found it.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center bg-card border border-border rounded-xl p-10">
          <h2 className="text-2xl font-bold">Save the number</h2>
          <p className="mt-2 text-muted-foreground max-w-2xl mx-auto">
            Call the next time a bid needs a bore. You&apos;ll get a number
            you can mark up, or hand the job off and take 10%. Either way,
            we&apos;re after an ongoing relationship, not a one-time job.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={`tel:+1${COMPANY.phone.replace(/[^0-9]/g, "")}`}
              className="flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors"
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
