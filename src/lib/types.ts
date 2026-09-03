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
  status: "new" | "contacted" | "quoted" | "closed";
  createdAt: string;
  notes: string;
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
    type: "bore-path" | "existing-line";
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
