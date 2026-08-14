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

export default async function ProjectsPage() {
  const projects = await getPublishedProjects();

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
