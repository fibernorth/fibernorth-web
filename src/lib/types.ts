import type { BoreOnEvent, BoreOnReadbackResult, BoreOnStatus } from "@/lib/bore-on/types";

export interface Service {
  id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  icon: string;
  features: string[];
  image: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  category: string;
  images: string[];
  location: string;
  date: string;
  isPublished: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface MajorProject {
  id: string;
  title: string;
  client: string;
  description: string;
  images: string[];
  scope: string;
  duration: string;
  location: string;
  isPublished: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Equipment {
  id: string;
  name: string;
  year: number;
  model: string;
  manufacturer: string;
  capability: string;
  description: string;
  image: string;
  isActive: boolean;
  sortOrder: number;
}

export interface TeamMember {
  id: string;
  name: string;
  title: string;
  bio: string;
  photo: string;
  sortOrder: number;
  isActive: boolean;
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage: string;
  author: string;
  tags: string[];
  category: string;
  isPublished: boolean;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  metaTitle: string;
  metaDescription: string;
}

export interface Testimonial {
  id: string;
  name: string;
  location: string;
  text: string;
  rating: number;
  projectType: string;
  isVisible: boolean;
  createdAt: string;
}

export interface JobPosting {
  id: string;
  title: string;
  payRange: string;
  season: string;
  schedule: string;
  duties: string[];
  requirements: string[];
  type: "full-time" | "seasonal" | "part-time";
  indeedUrl?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface QuoteRequest {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  serviceType: string;
  description: string;
  urgency: "flexible" | "soon" | "urgent";
  mapAnnotation: MapAnnotation | null;
  mapImageUrl: string;
  propertyPhotos: string[];
  howHeard: string;
  soilType?: string;
  quotedPrice?: number | null; // grand total worked up in the admin quote workbench
  quoteLines?: QuoteLine[] | null; // itemized work + materials behind quotedPrice
  status: "new" | "contacted" | "quoted" | "closed";
  createdAt: string;
  updatedAt?: string;
  notes: string;
  // Lead link (two-way with Lead.quoteId)
  leadId?: string;
  origin?: "website" | "lead";
  // Proposal / estimate lifecycle
  estimateStatus?: EstimateStatus;
  version?: number; // last sent version, 0 = never sent
  proposalId?: string; // token of the latest sent proposal
  sentAt?: string;
  viewedAt?: string;
  acceptedAt?: string;
  declinedAt?: string;
  expiresAt?: string;
  scopeText?: string;
  /** The last quote email we tried to send: who, when, which version, and Resend's id or the error. */
  lastEmail?: { to: string; at: string; version: number; id?: string; error?: string; bcc?: string[] };
  // Bore-ON Design Center link (see src/lib/bore-on). Set by the push route
  // and the signed callback; boreOnResult is Bore-ON's readback verbatim.
  boreOnUrl?: string;
  boreOnDesignId?: string;
  boreOnPushedAt?: string;
  boreOnWarnings?: Array<{ code: string; message: string }>;
  boreOnStatus?: BoreOnStatus;
  boreOnEvent?: BoreOnEvent;
  boreOnUpdatedAt?: string;
  boreOnDeliveryId?: string;
  boreOnResult?: BoreOnReadbackResult | null;
  boreOnPlanImageUrl?: string | null;
  /** When the callback last rewrote quoteLines/quotedPrice from the design. */
  boreOnRepricedAt?: string;
}

export type EstimateStatus = "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired";

/**
 * An immutable snapshot of a quote as sent to the customer. Doc id is the
 * public token. Only the server reads/writes these.
 */
export interface Proposal {
  quoteId: string;
  leadId: string;
  version: number;
  status: EstimateStatus | "superseded";
  supersededBy?: string;
  customer: { name: string; email: string; phone: string; address: string };
  scopeText: string;
  terms: string[];
  lines: QuoteLine[];
  totals: { work: number; materials: number; tax: number; total: number };
  annotation: MapAnnotation | null;
  /** Plan sheet rendered by Bore-ON Design Center, when the design was worked there. */
  planImageUrl?: string;
  sentAt: string;
  sentBy: string;
  sentTo: string;
  expiresAt: string;
  viewedAt?: string;
  viewCount?: number;
  acceptedAt?: string;
  acceptedName?: string;
  acceptedIp?: string;
  acceptedUa?: string;
  declinedAt?: string;
  declineReason?: string;
}

// One line on a worked-up quote. Materials are subject to Michigan's 6%
// sales tax; work/labor lines are not.
export interface QuoteLine {
  description: string;
  kind: "work" | "material";
  qty: number;
  unitPrice: number;
  /** "auto" = generated from the Bore-ON design; a re-sync replaces these and
   *  never touches a line the estimator typed or edited (absent = manual). */
  source?: "auto" | "manual";
  /** Stable id for an auto line (e.g. "bore-on:work:0"). */
  key?: string;
}

export interface MapAnnotation {
  center: { lat: number; lng: number };
  zoom: number;
  markers: Array<{
    type: "well" | "septic-tank" | "septic-field" | "utility-line" | "tree-obstacle";
    position: { lat: number; lng: number };
    label?: string;
  }>;
  paths: Array<{
    // "bore-path" = the customer's new run; "existing-<service>" = a marked
    // existing utility (e.g. "existing-power"); "existing-line" = legacy.
    type: string;
    points: Array<{ lat: number; lng: number }>;
    color: string;
  }>;
  polygons: Array<{
    type: "septic-field";
    points: Array<{ lat: number; lng: number }>;
  }>;
  // v2 fields (Leaflet quote-map tool). Optional so legacy stored
  // annotations keep parsing. This block is the seed data for automated
  // quoting: run footage x service x pipe size.
  labels?: Array<{ position: { lat: number; lng: number }; text: string }>;
  // Ground elevation sampled along the bore path (USGS 3DEP, feet): dists[i]
  // feet from the start of the run, elevs[i] feet above sea level.
  terrain?: {
    dists: number[];
    elevs: number[];
    // Rig and drill side picked on the admin workbench (src/lib/bore-on/profile).
    drillId?: string;
    drillSide?: "start" | "end";
  } | null;
  runFeet?: number;
  segmentFeet?: number[];
  service?: string;
  pipeSize?: string; // e.g. '1"', '2"', '4"+', "not-sure"
  address?: string; // geocoded address the customer searched, if any
  version?: 2;
}

export interface JobApplication {
  id: string;
  name: string;
  email: string;
  phone: string;
  positionsInterested: string[];
  hasCDL: boolean | null;
  equipmentExperience: string;
  resumeUrl: string;
  howHeard: string;
  status: "new" | "reviewed" | "contacted" | "hired" | "declined";
  createdAt: string;
  notes: string;
}

export interface SiteSettings {
  companyName: string;
  legalName: string;
  phone: string;
  email: string;
  address: string;
  poBox: string;
  city: string;
  state: string;
  zip: string;
  hours: Record<string, string>;
  socialLinks: Record<string, string>;
}
