import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { getPublishedProjects } from "@/lib/server-data";
import { SERVICES } from "@/lib/constants";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Projects",
  description:
    "See our directional drilling and trenchless installation projects across Northern Michigan. Water lines, septic, drainage, power, and more.",
};

const categoryLabels: Record<string, string> = {
  "water-lines": "Water Lines",
  septic: "Septic",
  drainage: "Drainage",
  power: "Power",
  gas: "Gas",
  irrigation: "Irrigation",
  fiber: "Fiber & Cable",
  "culvert-driveway": "Culvert & Driveway",
};

// Fallback shown until projects are added in the admin panel. Sourced from
// completed FiberNorth work — edit or replace via /admin/projects.
const fallbackProjects = [
  {
    id: "fallback-mainline",
    title: "Mesick FTTH Fiber Build",
    description:
      "145,000 feet of duct installed in three and a half months on a fiber-to-the-home build for a regional network contractor — plus 150+ individual home drops, every foot GPS-tracked with our Bore-ON system.",
    category: "fiber",
    images: ["/images/projects/mesick-m37.jpg"],
    location: "Wexford County, MI",
    date: "2026 — ongoing",
    isPublished: true,
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "fallback-winter-build",
    title: "Winter Fiber Build",
    description:
      "110,000 feet of conduit installed through the winter months for a local internet provider. Frozen ground doesn't stop a directional drill — we kept crews boring all season.",
    category: "fiber",
    images: ["/images/projects/winter-forest-road.jpg"],
    location: "Missaukee & Benzie Counties, MI",
    date: "Winter 2025–26",
    isPublished: true,
    sortOrder: 1,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "fallback-manistee-lights",
    title: "Parking Lot Lighting Conduit",
    description:
      "Bored electrical conduit for an electrical contractor's parking lot lighting project — under existing pavement with no asphalt cuts, keeping the drilling clear of areas with unknown private utilities.",
    category: "power",
    images: ["/images/projects/manistee-roadside.jpg"],
    location: "Manistee, MI",
    date: "2026",
    isPublished: true,
    sortOrder: 2,
    createdAt: "",
    updatedAt: "",
  },
];

export default async function ProjectsPage() {
  const firestoreProjects = await getPublishedProjects();
  const projects =
    firestoreProjects.length > 0 ? firestoreProjects : fallbackProjects;

  return (
    <div className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            Our <span className="text-primary">Projects</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Real work, real results. See how we&apos;ve helped homeowners and
            contractors across Northern Michigan get utilities underground
            without the mess.
          </p>
        </div>

        {/* Year-to-date stats */}
        <div className="grid grid-cols-3 gap-4 mb-12 max-w-3xl mx-auto">
          <div className="bg-card border border-border rounded-lg p-5 text-center">
            <p className="text-2xl sm:text-3xl font-black text-primary">250,000+</p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Feet of product installed this year
            </p>
          </div>
          <div className="bg-card border border-border rounded-lg p-5 text-center">
            <p className="text-2xl sm:text-3xl font-black text-primary">150+</p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Fiber drops to homes
            </p>
          </div>
          <div className="bg-card border border-border rounded-lg p-5 text-center">
            <p className="text-2xl sm:text-3xl font-black text-primary">12</p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Months a year we drill — winter included
            </p>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <FolderOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-muted-foreground">
              Project photos coming soon
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              We&apos;re building out our portfolio. Check back soon to see our
              work in action.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <div
                key={project.id}
                className="bg-card border border-border rounded-lg overflow-hidden group"
              >
                {project.images?.[0] ? (
                  <div className="relative aspect-video overflow-hidden">
                    <Image
                      src={project.images[0]}
                      alt={project.title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  </div>
                ) : (
                  <div className="aspect-video bg-muted flex items-center justify-center">
                    <FolderOpen className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
                <div className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold">{project.title}</h3>
                    {project.category && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        {categoryLabels[project.category] || project.category}
                      </span>
                    )}
                  </div>
                  {project.description && (
                    <p className="text-sm text-muted-foreground mb-3">
                      {project.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {project.location && <span>{project.location}</span>}
                    {project.date && <span>{project.date}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {projects === fallbackProjects && (
          <p className="mt-8 text-xs text-muted-foreground/70 text-center">
            Road photos:{" "}
            <a
              href="https://www.flickr.com/photos/dougtone/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-muted-foreground"
            >
              Doug Kerr
            </a>
            ,{" "}
            <a
              href="https://creativecommons.org/licenses/by-sa/2.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-muted-foreground"
            >
              CC BY-SA 2.0
            </a>{" "}
            (cropped) &middot; U.S. Forest Service, public domain
          </p>
        )}

        <div className="mt-12 text-center">
          <p className="text-muted-foreground mb-4">
            Want to see what we can do for your project?
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
