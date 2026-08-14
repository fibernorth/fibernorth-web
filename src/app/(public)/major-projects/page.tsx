import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { getPublishedMajorProjects } from "@/lib/server-data";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Major Projects",
  description:
    "Large-scale fiber optic, telecommunications, and utility construction projects by FiberNorth, Inc. across Northern Michigan.",
};

const fallbackProjects = [
  {
    id: "1",
    title: "Grand Traverse Resort",
    duration: "2013",
    description:
      "WiFi fiber infrastructure to condo buildings using directional drilling across the resort property.",
    scope: "Fiber optic network installation",
    location: "Acme, MI",
    client: "",
    images: [],
    isPublished: true,
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "2",
    title: "Grand Traverse Band",
    duration: "2017",
    description:
      "8-mile dual robust fiber networks connecting tribal complexes across the Grand Traverse region.",
    scope: "8 miles of dual fiber backbone",
    location: "Grand Traverse Region",
    client: "",
    images: [],
    isPublished: true,
    sortOrder: 1,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "3",
    title: "Grand Traverse Commons",
    duration: "2018",
    description:
      "Fiber optic internet installation throughout the historic Commons development.",
    scope: "Fiber to the premises (FTTP)",
    location: "Traverse City, MI",
    client: "",
    images: [],
    isPublished: true,
    sortOrder: 2,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "4",
    title: "Cellular Tower Expansion",
    duration: "2015",
    description:
      "Fiber connections to approximately 25 cell towers across Northern Michigan for a major carrier.",
    scope: "~25 cell tower fiber connections",
    location: "Northern Michigan",
    client: "",
    images: [],
    isPublished: true,
    sortOrder: 3,
    createdAt: "",
    updatedAt: "",
  },
];

export default async function MajorProjectsPage() {
  const firestoreProjects = await getPublishedMajorProjects();
  const projects =
    firestoreProjects.length > 0 ? firestoreProjects : fallbackProjects;

  return (
    <div className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            Major <span className="text-primary">Projects</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Beyond residential work, FiberNorth has built large-scale fiber
            optic and telecommunications infrastructure across Northern Michigan
            since 2011.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-card border border-border rounded-lg overflow-hidden"
            >
              {project.images?.[0] ? (
                <div className="relative aspect-video">
                  <Image
                    src={project.images[0]}
                    alt={project.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 50vw"
                  />
                </div>
              ) : null}
              <div className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-bold">{project.title}</h2>
                  </div>
                  {project.duration && (
                    <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      {project.duration}
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-sm mb-4">
                  {project.description}
                </p>
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {project.scope && (
                    <span>
                      <strong className="text-foreground">Scope:</strong>{" "}
                      {project.scope}
                    </span>
                  )}
                  {project.location && (
                    <span>
                      <strong className="text-foreground">Location:</strong>{" "}
                      {project.location}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-muted-foreground mb-4">
            Interested in our capabilities for large-scale projects?
          </p>
          <Link
            href="/contact"
            className="inline-block px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 transition-colors"
          >
            Contact Us
          </Link>
        </div>
      </div>
    </div>
  );
}
