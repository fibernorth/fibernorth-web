// What the generic CMS actions (src/actions/crud.ts) may write, per
// collection. Built from each admin page's form fields plus the fields the
// public site and src/lib/types.ts read. Unknown keys are refused, and every
// string, list and number is capped, so a save can't stuff arbitrary data
// (or a 1 MiB blob) into a public collection.
//
// Collections with their own screens and actions are not here on purpose:
// siteSettings (Settings), siteContent (Page content), leads, quotes.
// jobApplications arrive through /api/application; admins only change their
// status and notes.

import { z } from "zod";

const str = (max: number) => z.string().max(max, `must be at most ${max} characters`);
const url = str(2000);
const bool = z.boolean();
const sortOrder = z.number().int().min(-100000).max(100000);
const strList = (maxLen: number, maxItems: number) =>
  z.array(z.string().max(maxLen)).max(maxItems, `at most ${maxItems} entries`);
const day = str(40);

const schemas = {
  blog: {
    title: str(300),
    slug: str(200),
    excerpt: str(2000),
    content: str(200_000),
    coverImage: url,
    author: str(200),
    tags: strList(60, 50),
    category: str(100),
    isPublished: bool,
    publishedAt: day,
    metaTitle: str(300),
    metaDescription: str(500),
  },
  fleet: {
    name: str(200),
    year: z.number().int().min(0).max(3000),
    model: str(200),
    manufacturer: str(200),
    capability: str(300),
    description: str(5000),
    image: url,
    isActive: bool,
    sortOrder,
  },
  jobPostings: {
    title: str(200),
    payRange: str(100),
    season: str(200),
    schedule: str(200),
    duties: strList(500, 50),
    requirements: strList(500, 50),
    type: z.enum(["full-time", "seasonal", "part-time"]),
    indeedUrl: url,
    isActive: bool,
    sortOrder,
  },
  majorProjects: {
    title: str(300),
    client: str(300),
    description: str(5000),
    images: strList(2000, 50),
    scope: str(1000),
    duration: str(200),
    location: str(300),
    isPublished: bool,
    sortOrder,
  },
  projects: {
    title: str(300),
    description: str(5000),
    category: str(100),
    images: strList(2000, 50),
    location: str(300),
    date: day,
    isPublished: bool,
    sortOrder,
  },
  team: {
    name: str(200),
    title: str(200),
    bio: str(5000),
    photo: url,
    sortOrder,
    isActive: bool,
  },
  testimonials: {
    name: str(200),
    location: str(200),
    text: str(5000),
    rating: z.number().int().min(1).max(5),
    projectType: str(200),
    isVisible: bool,
  },
  services: {
    name: str(200),
    slug: str(200),
    description: str(10000),
    shortDescription: str(1000),
    icon: str(100),
    features: strList(500, 50),
    image: url,
    sortOrder,
    isActive: bool,
  },
  bids: {
    title: str(300),
    agency: str(300),
    county: str(100),
    role: str(50),
    source: str(300),
    docsUrl: url,
    dueDate: day,
    status: str(50),
    amount: z.union([str(100), z.number().min(0).max(1e10)]),
    notes: str(10000),
  },
  jobApplications: {
    status: z.enum(["new", "reviewed", "contacted", "hired", "declined"]),
    notes: str(10000),
  },
} as const;

/** siteContent/{page}: the text fields the Page content editor has for each page. */
export const PAGE_CONTENT_FIELDS: Record<string, readonly string[]> = {
  home: ["heroTitle", "heroSubtitle", "ctaText"],
  about: ["story"],
  services: ["intro"],
  whyTrenchless: ["intro", "costComparison"],
  contact: [],
};

/** Stale-save refusal for the CMS forms (crud edit, page content). */
export const STALE_MESSAGE = "Changed by someone else since you opened it. Reload.";

export type CrudCollection = keyof typeof schemas;

/** Collections the generic create action may add to. */
const CREATABLE = new Set<string>(Object.keys(schemas).filter((c) => c !== "jobApplications"));

const objectSchemas = Object.fromEntries(
  Object.entries(schemas).map(([c, shape]) => [c, z.object(shape).partial().strict()])
) as unknown as Record<CrudCollection, z.ZodType<Record<string, unknown>>>;

/** Keys the server sets itself; a client copy of them is dropped, not refused. */
const SYSTEM_KEYS = new Set(["id", "createdAt", "updatedAt"]);

export function isCrudCollection(c: string): c is CrudCollection {
  return Object.prototype.hasOwnProperty.call(schemas, c);
}

export function crudFields(c: CrudCollection): string[] {
  return Object.keys(schemas[c]);
}

export type CrudCheck = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

/**
 * Validate a create or update payload for a CMS collection. Refuses
 * collections without a schema, unknown fields and oversize values.
 */
export function validateCrudData(collection: string, data: unknown, mode: "create" | "update"): CrudCheck {
  if (!isCrudCollection(collection)) return { ok: false, error: "That collection can't be edited here." };
  if (mode === "create" && !CREATABLE.has(collection)) return { ok: false, error: "New entries can't be added here." };
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: "Nothing to save." };
  const input: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (SYSTEM_KEYS.has(k) || v === undefined) continue;
    input[k] = v;
  }
  const parsed = objectSchemas[collection].safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  const issue = parsed.error.issues[0];
  if (issue?.code === "unrecognized_keys") {
    return { ok: false, error: `Unknown field${issue.keys.length === 1 ? "" : "s"}: ${issue.keys.join(", ")}` };
  }
  const field = issue?.path?.length ? String(issue.path[0]) : "";
  return { ok: false, error: field ? `${field}: ${issue?.message}` : issue?.message || "Check the fields." };
}
