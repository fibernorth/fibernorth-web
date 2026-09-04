import { Metadata } from "next";
import Link from "next/link";
import {
  Wifi,
  Cable,
  Network,
  Snowflake,
  Phone,
  Check,
  TreePine,
  Handshake,
  Radar,
  Droplets,
} from "lucide-react";
import { COMPANY } from "@/lib/constants";

export const metadata: Metadata = {
  title: { absolute: "Campground WiFi Infrastructure | Fiber, Not Repeaters | Northern Michigan" },
  description:
    "Campground WiFi that survives July. We bore fiber to your access points instead of daisy-chaining wireless repeaters, and we can line up the internet feed too. Built in the off-season.",
};

const problems = [
  {
    icon: Wifi,
    title: "Full Bars, Nothing Loads",
    description:
      "Ask any camper: the signal shows full bars and pages still won't load. That's not a coverage problem, and another access point won't fix it. It's bandwidth. Most campground WiFi rides on chains of wireless repeaters, and every hop cuts the bandwidth roughly in half, so the back loop is sharing scraps.",
  },
  {
    icon: TreePine,
    title: "Trees and Weather Eat Wireless Links",
    description:
      "The point-to-point radios feeding your far buildings lose signal when the leaves come in and drop entirely in ice storms. The fix that actually holds is glass in the ground, where the weather can't reach it.",
  },
  {
    icon: Network,
    title: "The Feed Is Too Small",
    description:
      "A hundred campsites streaming on a connection sized for a house doesn't work no matter how good the WiFi gear is. We sell fiber connections through several carriers, so we can price the feed your park actually needs.",
  },
];

const services = [
  {
    icon: Cable,
    title: "Fiber to Every Access Point",
    description:
      "We bore fiber between your buildings and out to the pole-mounted access points across the property — under roads, sites, and mature trees without disturbing any of it. Wired backhaul means every access point gets full capacity, not a share of a repeater chain.",
  },
  {
    icon: Handshake,
    title: "Keep Your WiFi Vendor",
    description:
      "We don't sell WiFi gear and we're not after your IT company's job. We build the fiber their equipment should have been sitting on all along — and since most WiFi companies don't sell the internet connection either, we're not stepping on their toes there when we line up the feed. Everybody's piece works better.",
  },
  {
    icon: Network,
    title: "The Internet Feed Itself",
    description:
      "FiberNorth was founded by the president of an internet provider, and we're an authorized agent for multiple fiber carriers. One conversation covers the connection to your property and the construction to spread it across the park.",
  },
  {
    icon: Snowflake,
    title: "Built While You're Closed",
    description:
      "October through April the park is empty and frozen ground doesn't stop a directional drill. We build all off-season, and you open in spring with WiFi that works — no torn-up sites, no construction during your season.",
  },
  {
    icon: Radar,
    title: "We Find What's Already Buried",
    description:
      "MISS DIG only marks public utilities, and a campground is mostly private ones — decades of water, power, and septic runs nobody has a map for. Our own utility locating specialists find and mark all of it before any drill head moves, so your infrastructure is protected and, for once, documented.",
  },
  {
    icon: Droplets,
    title: "Upgrade Sewer, Water & Power Too",
    description:
      "Once the crew and the drill are on your property, adding capacity is cheap. Bigger water lines to a new loop, power to added sites, a sewer run to the new bathhouse — bored under everything in the same mobilization as the fiber.",
  },
];

export default function CampgroundsPage() {
  return (
    <div className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="max-w-3xl mb-14">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-4">
            For Campgrounds, RV Resorts &amp; Marinas
          </p>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight">
            Good WiFi Starts Underground
          </h1>
          <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
            Your guests didn&apos;t haul a camper up north to watch a loading
            spinner. When campground WiFi is bad, it&apos;s almost never the
            signal and almost never the gear. It&apos;s bandwidth: repeater
            chains and wireless links that starve every site, and a feed
            that&apos;s too small for the park. We fix the bandwidth with
            fiber in the ground, bored under your roads and sites without
            tearing anything up, and we can line up the internet feed to the
            property while we&apos;re at it.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4">
            <a
              href={`tel:+1${COMPANY.phone.replace(/[^0-9]/g, "")}`}
              className="flex items-center justify-center gap-2 px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Phone className="h-4 w-4" />
              Talk It Through: {COMPANY.phone}
            </a>
            <Link
              href="/contact"
              className="px-8 py-3 border border-border font-medium rounded-lg hover:bg-muted transition-colors text-center"
            >
              Get a Free Site Assessment
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-accent" />
              Founded by an internet provider&apos;s president
            </span>
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-accent" />
              Off-season construction
            </span>
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-accent" />
              No sites torn up
            </span>
          </div>
        </div>

        {/* Why campground WiFi fails */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-2">
            Why Campground WiFi <span className="text-primary">Fails Every July</span>
          </h2>
          <p className="text-muted-foreground mb-8 max-w-2xl">
            Guests rank WiFi with clean bathrooms now, and they say so in the
            reviews. Three things break it, and none of them get fixed by
            buying another router.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            {problems.map((p) => (
              <div key={p.title} className="bg-card border border-border rounded-xl p-7">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <p.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-bold">{p.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* What we do */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-2">
            What We <span className="text-primary">Actually Do</span>
          </h2>
          <p className="text-muted-foreground mb-8 max-w-2xl">
            Networks and directional boring are both our trade. That
            combination is rare, and it&apos;s exactly what a campground
            build needs.
          </p>
          <div className="grid sm:grid-cols-2 gap-6">
            {services.map((s) => (
              <div key={s.title} className="bg-card border border-border rounded-xl p-7">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <s.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-bold">{s.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Track record */}
        <div className="bg-card border border-border rounded-xl p-8 sm:p-10 mb-16">
          <h2 className="text-2xl font-bold mb-4">We&apos;ve Done This — Including at a Campground</h2>
          <p className="text-muted-foreground max-w-3xl">
            Last year we built the underground for a KOA campground&apos;s new
            expansion, working right alongside the company providing the WiFi
            — exactly the arrangement described above. Before that, we built
            the fiber infrastructure serving WiFi across the condo buildings
            of a major Grand Traverse area resort, and we&apos;ve put fiber in
            the ground for internet providers across Northern Michigan for
            over a decade, including a 145,000-foot build finished in one
            season. A campground loop is a comfortable job for a crew that
            works at that scale.
          </p>
          <p className="text-muted-foreground max-w-3xl mt-4">
            Every bore is MISS DIG 811 compliant, and your existing water,
            power, and septic runs get located before the drill head goes
            anywhere near them. When we leave, the only evidence is WiFi that
            works at the back loop.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center bg-card border border-border rounded-xl p-10">
          <h2 className="text-2xl font-bold">Planning winter projects?</h2>
          <p className="mt-2 text-muted-foreground">
            The parks that open next spring with working WiFi are the ones
            that call this fall. Walk us through the property — the
            assessment is free.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/contact"
              className="px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors"
            >
              Get a Free Site Assessment
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
