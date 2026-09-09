import { Metadata } from "next";
import {
  Phone,
  Check,
  Network,
  Drill,
  PhoneCall,
  Wifi,
  ShieldCheck,
  Building2,
  Cloud,
  Lock,
} from "lucide-react";
import { COMPANY } from "@/lib/constants";
import { InternetLeadForm } from "@/components/quote/lead-form";

export const metadata: Metadata = {
  title: {
    absolute:
      "Business Internet | Every Carrier, One Call | FiberNorth Underground",
  },
  description:
    "Carrier-neutral agent for business internet in Northern Michigan. We price every provider that serves your address and the carriers pay us, not you.",
};

const services = [
  {
    icon: Network,
    title: "Dedicated Fiber Internet",
    description:
      "Your own circuit, not a shared one. Guaranteed speeds both directions and a repair clock in writing. For any business where the internet going down costs real money.",
  },
  {
    icon: Wifi,
    title: "Backup That Kicks In by Itself",
    description:
      "A wireless connection that sits behind your main circuit and takes over the moment it drops. Card readers keep running. Most owners never know it switched.",
  },
  {
    icon: PhoneCall,
    title: "Business Phones in the Cloud",
    description:
      "Phone systems that follow your people instead of living in a closet. One number rings the desk, the truck, and the house. Priced per seat, no hardware to babysit.",
  },
  {
    icon: ShieldCheck,
    title: "Copper Phone Line Replacement",
    description:
      "Copper lines for elevator phones, fire panels, and fax machines are going away, and the ones left cost more every year. We swap them for modern lines the inspector will sign off on, usually for less than the copper costs you now.",
  },
  {
    icon: Building2,
    title: "Multiple Locations, One Network",
    description:
      "Branches, satellite offices, a shop across town. We tie them together so they act like one building, with the right circuit at each address.",
  },
  {
    icon: Cloud,
    title: "Cloud, Backup & Data Centers",
    description:
      "Server space, offsite backup, disaster recovery, Microsoft 365. If the answer to \"what happens if the office burns down\" is a shrug, we can fix that.",
  },
  {
    icon: Lock,
    title: "Network Security",
    description:
      "Managed firewalls, protection against attacks, and somebody watching the network who isn't also running your front desk. Sized for real businesses, not Fortune 500 budgets.",
  },
];

const buyers = [
  "Medical and dental offices",
  "Banks and credit unions",
  "Manufacturers and processors",
  "Townships, schools, and county buildings",
  "Hotels, resorts, and campgrounds",
  "Multi-location shops and restaurants",
];

export default function BusinessInternetPage() {
  return (
    <div className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="max-w-3xl mb-14">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-4">
            For Northern Michigan Businesses
          </p>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight">
            We Shop Every Carrier for Your Business Internet
          </h1>
          <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
            Calling one internet company gets you one price. We&apos;re a
            carrier-neutral agent: give us the address and we price every
            provider that can serve it, from dedicated fiber to cable to
            fixed wireless. Then we hand you the comparison. The carriers
            pay us, so you don&apos;t.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4">
            <a
              href={`tel:+1${COMPANY.phone.replace(/[^0-9]/g, "")}`}
              className="flex items-center justify-center gap-2 px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Phone className="h-4 w-4" />
              Call {COMPANY.phone}, Ask for Bill
            </a>
            <a
              href="#quote"
              className="flex items-center justify-center gap-2 px-8 py-3 border border-border font-semibold rounded-lg hover:bg-muted transition-colors"
            >
              Request a Free Carrier Check
            </a>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-accent" />
              No cost to you, ever
            </span>
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-accent" />
              100+ providers quoted
            </span>
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-accent" />
              Local guy answers the phone
            </span>
          </div>
        </div>

        {/* Why a boring company */}
        <div className="bg-card border border-border rounded-xl p-8 sm:p-10 mb-16">
          <h2 className="text-2xl font-bold mb-4">
            Why a Boring Company Sells Internet
          </h2>
          <div className="max-w-3xl space-y-4 text-muted-foreground leading-relaxed">
            <p>
              We put fiber in the ground for internet providers all over
              Northern Michigan. Backbone routes, cell tower connections,
              whole campuses. Somewhere along the way we learned which
              carriers are good, which are cheap, and which are both.
            </p>
            <p>
              Now we&apos;re licensed to sell for all of them. When you buy a
              circuit through us, the carrier pays our commission. You pay
              what you&apos;d pay them, plus you get somebody local who knows
              what that carrier&apos;s network actually looks like on your
              road.
            </p>
          </div>
        </div>

        {/* The construction edge */}
        <div className="bg-card border border-border rounded-xl p-8 sm:p-10 mb-16">
          <div className="flex items-center gap-3 mb-4">
            <Drill className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">
              When the Carrier Says &quot;Construction Required&quot;
            </h2>
          </div>
          <div className="max-w-3xl space-y-4 text-muted-foreground leading-relaxed">
            <p>
              Here&apos;s how most fiber quotes die up north: the price of the
              service is fine, then the carrier adds a construction fee for
              getting fiber from the road to your building, and the number
              kills the deal.
            </p>
            <p>
              That fee is for the digging. We own the drills. We can look at
              the same 900 feet the carrier&apos;s engineer looked at, price
              it honestly, and often build it ourselves for less. Not many
              internet agents own their own drills. We do, and it keeps a
              lot of dead quotes alive.
            </p>
          </div>
        </div>

        {/* Services */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-2">
            What We Can <span className="text-primary">Get You</span>
          </h2>
          <p className="text-muted-foreground mb-8 max-w-2xl">
            Dedicated internet is the big one. The rest rides along on the
            same phone call.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((s) => (
              <div
                key={s.title}
                className="bg-card border border-border rounded-xl p-7"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <s.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-bold">{s.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {s.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Who this is for */}
        <div className="bg-card border border-border rounded-xl p-8 sm:p-10 mb-16">
          <h2 className="text-2xl font-bold mb-4">Who Calls Us</h2>
          <p className="text-muted-foreground max-w-3xl mb-6">
            Anybody whose day stops when the internet does, or whose building
            still has copper lines feeding an elevator phone or a fire panel.
          </p>
          <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-3 max-w-3xl">
            {buyers.map((b) => (
              <li key={b} className="flex gap-3 text-muted-foreground">
                <Check className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA + lead form */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold">
            Find Out What Your Address Can Actually Get
          </h2>
          <p className="mt-2 text-muted-foreground max-w-2xl mx-auto">
            Or skip the form and call{" "}
            <a
              href={`tel:+1${COMPANY.phone.replace(/[^0-9]/g, "")}`}
              className="text-primary hover:underline"
            >
              {COMPANY.phone}
            </a>{" "}
            and ask for Bill.
          </p>
        </div>
        <div id="quote" className="max-w-3xl mx-auto scroll-mt-24">
          <InternetLeadForm />
        </div>
      </div>
    </div>
  );
}
