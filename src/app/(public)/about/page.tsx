import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { TEAM as FALLBACK_TEAM, TRUST_SIGNALS } from "@/lib/constants";
import { Shield, MapPin, Radar, FileText, Users } from "lucide-react";
import { getActiveTeamMembers } from "@/lib/server-data";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "About Us",
  description:
    "FiberNorth Underground — founded in 2011 by Bill Gaylord. Over a decade of directional drilling and underground utility expertise in Northern Michigan.",
};

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Shield,
  MapPin,
  Radar,
  FileText,
};

export default async function AboutPage() {
  const firestoreTeam = await getActiveTeamMembers();
  const team =
    firestoreTeam.length > 0
      ? firestoreTeam
      : FALLBACK_TEAM.map((t) => ({
          ...t,
          id: t.name,
          bio: "",
          photo: "",
          isActive: true,
        }));

  return (
    <div className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Story */}
        <div className="max-w-3xl mx-auto mb-20">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-center mb-10">
            Who <span className="text-primary">Shows Up</span>
          </h1>

          <div className="prose prose-neutral prose-lg max-w-none space-y-4 text-muted-foreground">
            <p>
              Letting a crew drill under your yard is a trust decision. You want
              to know who they are, whether they know where your gas and water
              lines run, and whether the lawn will look like anything happened.
              Fair questions. Here are the answers.
            </p>
            <p>
              FiberNorth, Inc. was founded in 2011 by Bill Gaylord while serving
              as President of 186Networks. Bill saw fiber internet transforming
              Northern Michigan and launched FiberNorth to build the underground
              infrastructure to make it happen. When he stepped away from
              186Networks in 2022, it was to focus on FiberNorth full time.
            </p>
            <p>
              That&apos;s more than a decade of boring thousands of feet beneath
              Northern Michigan — under driveways, tree lines, and septic fields
              — built on Bill&apos;s more than 20 years in the trade. When the
              crew pulls into your driveway, it&apos;s a local company from
              Williamsburg, not a franchise passing through. We work where we
              live, and our reputation rides on every yard we leave behind.
            </p>
            <p>
              We also own our equipment — five directional drills plus a
              hydrovac. That matters to you two ways. First, we bring the
              machine that fits your job: a compact rig for a tight backyard, a
              bigger one for a long run, instead of whatever&apos;s on the
              truck. Second, before we drill anywhere near your existing
              utilities, the hydrovac exposes them so we can see them — not
              guess at them. And because nothing is rented, your job never waits
              on a rental yard.
            </p>
            <p className="text-foreground font-medium">
              Today, FiberNorth Underground serves homeowners, builders, excavators,
              well drillers, and farmers — from a water line to your new garage
              to a multi-mile fiber build.
            </p>
          </div>
        </div>

        {/* What We Do */}
        <div className="max-w-3xl mx-auto mb-20">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6">What We Do</h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-primary mb-2">
                Directional Drilling &amp; Trenchless Installations
              </h3>
              <p className="text-muted-foreground">
                Our directional drilling and advanced plowing equipment installs
                water lines, electric lines, sewer lines, drainage, septic,
                irrigation, and conduit with minimal ground disturbance. Faster,
                cleaner, and often more cost-effective than open trenching — and
                our equipment runs in any weather, year-round.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-primary mb-2">
                Fiber Optic Installation &amp; Splicing
              </h3>
              <p className="text-muted-foreground">
                State-of-the-art fiber optic blowing equipment for long-distance
                runs, plus fusion splicing, testing, and repair for all fiber
                types.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-primary mb-2">
                Utility Location
              </h3>
              <p className="text-muted-foreground">
                Professional underground utility locating to identify existing
                infrastructure before any work begins. We have a locating
                specialist on staff.
              </p>
            </div>
            <p className="text-sm text-muted-foreground italic">
              We also offer network design, troubleshooting, and wireless
              installations for clients who need connectivity solutions alongside
              their underground work.
            </p>
          </div>
        </div>

        {/* Team */}
        <div className="mb-20">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold flex items-center justify-center gap-3">
              <Users className="h-7 w-7 text-primary" />
              Meet the Team
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {team.map((member) => (
              <div
                key={member.id}
                className="bg-card border border-border rounded-lg p-5 text-center"
              >
                {member.photo ? (
                  <div className="relative w-16 h-16 mx-auto mb-3 rounded-full overflow-hidden">
                    <Image
                      src={member.photo}
                      alt={member.name}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 bg-muted rounded-full mx-auto mb-3 flex items-center justify-center">
                    <span className="text-xl font-bold text-muted-foreground">
                      {member.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </span>
                  </div>
                )}
                <h3 className="font-semibold">{member.name}</h3>
                <p className="text-sm text-primary">{member.title}</p>
                {member.bio && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {member.bio}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Trust Signals */}
        <div className="bg-card border border-border rounded-lg p-8">
          <h2 className="text-xl font-bold text-center mb-8">
            Before We Touch Your Property
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {TRUST_SIGNALS.map((signal) => {
              const Icon = iconMap[signal.icon];
              return (
                <div
                  key={signal.text}
                  className="flex items-center gap-3 justify-center"
                >
                  {Icon && <Icon className="h-6 w-6 text-primary shrink-0" />}
                  <span className="text-sm font-medium">{signal.text}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <p className="text-muted-foreground mb-4">
            Have a project in mind? Tell us what you need buried and where.
          </p>
          <Link
            href="/contact"
            className="inline-block px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 transition-colors"
          >
            Get a Free Quote
          </Link>
        </div>
      </div>
    </div>
  );
}
