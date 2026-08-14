import { Metadata } from "next";
import Link from "next/link";
import {
  Briefcase,
  MapPin,
  Clock,
  DollarSign,
  Check,
  ClipboardList,
  ExternalLink,
} from "lucide-react";
import { COMPANY } from "@/lib/constants";
import { getActiveJobPostings } from "@/lib/server-data";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Careers",
  description:
    "Join FiberNorth Underground — hiring directional drill operators, plow operators, laborers, and crew foremen in Northern Michigan.",
};

const benefits = [
  {
    title: "Competitive Hourly Pay",
    description:
      "Pay is posted with every position — no guessing games. We pay for the skills you bring and the work you do.",
  },
  {
    title: "Home Every Night",
    description:
      "All of our work is local to Northern Michigan. No travel crews, no weeks away — sleep in your own bed.",
  },
  {
    title: "Weekends Are Yours",
    description:
      "Monday through Friday schedule. We work hard during the week and go home.",
  },
  {
    title: "We Promote From Within",
    description:
      "Start as a laborer, learn the trade, run a drill, lead a crew. Our foremen came up through the ranks.",
  },
  {
    title: "Good Equipment",
    description:
      "Modern, well-maintained machines — 5 directional drills and a full support fleet. No junk, no excuses.",
  },
  {
    title: "Referral Bonus",
    description:
      "Know someone who'd be a good fit? Bring us good people and get paid for it.",
  },
  {
    title: "No Egos, No Politics",
    description:
      "A professional operation with clear expectations and mutual respect. We do the work and treat people right.",
  },
  {
    title: "Steady Seasonal Work",
    description:
      "Consistent hours through the season with a growing company that keeps its crews busy.",
  },
];

export default async function EmploymentPage() {
  const positions = await getActiveJobPostings();

  return (
    <div className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            Join <span className="text-primary">Our Crew</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            FiberNorth Underground is growing. We need good people who want steady work,
            fair pay, and a team that respects their time.
          </p>
        </div>

        {/* Benefits */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">
            What We <span className="text-primary">Offer</span>
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {benefits.map((benefit) => (
              <div
                key={benefit.title}
                className="bg-card border border-border rounded-lg p-5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Check className="h-5 w-5 text-accent shrink-0" />
                  <h3 className="font-semibold text-sm">{benefit.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Positions */}
        <h2 className="text-2xl font-bold mb-6">Open Positions</h2>

        {positions.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-12 text-center mb-12">
            <ClipboardList className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground">
              No open positions right now
            </h3>
            <p className="text-sm text-muted-foreground mt-2">
              We&apos;re not actively hiring at the moment, but we&apos;re always
              interested in good people. Reach out if you&apos;d like to be
              considered for future openings.
            </p>
          </div>
        ) : (
          <div className="space-y-6 mb-12">
            {positions.map((position) => (
              <div
                key={position.id}
                className="bg-card border border-border rounded-lg p-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <Briefcase className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-bold">{position.title}</h3>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs">
                    {position.payRange && (
                      <span className="flex items-center gap-1 bg-primary/10 text-primary px-2.5 py-1 rounded-full">
                        <DollarSign className="h-3 w-3" />
                        {position.payRange}
                      </span>
                    )}
                    {position.season && (
                      <span className="flex items-center gap-1 bg-muted text-muted-foreground px-2.5 py-1 rounded-full">
                        <Clock className="h-3 w-3" />
                        {position.season}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {position.duties && position.duties.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                        What You&apos;ll Do
                      </h4>
                      <ul className="space-y-1.5">
                        {position.duties.filter(Boolean).map((duty) => (
                          <li
                            key={duty}
                            className="text-sm text-muted-foreground flex items-start gap-2"
                          >
                            <span className="text-primary mt-1">&bull;</span>
                            {duty}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {position.requirements && position.requirements.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                        What We&apos;re Looking For
                      </h4>
                      <ul className="space-y-1.5">
                        {position.requirements.filter(Boolean).map((req) => (
                          <li
                            key={req}
                            className="text-sm text-muted-foreground flex items-start gap-2"
                          >
                            <span className="text-primary mt-1">&bull;</span>
                            {req}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {position.indeedUrl && (
                  <div className="mt-5 pt-4 border-t border-border">
                    <a
                      href={position.indeedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
                    >
                      Apply on Indeed
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Indeed */}
        <div className="bg-card border border-border rounded-lg p-6 mb-12 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="font-bold">Prefer to apply through Indeed?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Our current openings are also posted on Indeed with full details
              and one-click apply.
            </p>
          </div>
          <a
            href={COMPANY.indeedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-primary text-primary text-sm font-semibold rounded-md hover:bg-primary/10 transition-colors shrink-0"
          >
            See Our Jobs on Indeed
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        {/* Apply CTA */}
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <h2 className="text-2xl font-bold mb-2">Ready to Apply?</h2>
          <p className="text-muted-foreground mb-6">
            No fancy resume needed. Just tell us who you are, what you can do,
            and how to reach you.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={`tel:+1${COMPANY.phone.replace(/[^0-9]/g, "")}`}
              className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary/90 transition-colors"
            >
              <MapPin className="h-4 w-4" />
              Call {COMPANY.phone}
            </a>
            <a
              href={`mailto:${COMPANY.email}?subject=Job Application`}
              className="px-6 py-3 border border-border text-foreground font-medium rounded-md hover:bg-muted transition-colors"
            >
              Email {COMPANY.email}
            </a>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Know someone who&apos;d be a good fit? Referral bonus available — ask us.
          </p>
        </div>
      </div>
    </div>
  );
}
