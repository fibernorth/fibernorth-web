import type { MetadataRoute } from "next";
import { SERVICES } from "@/lib/constants";
import { getPublishedBlogPosts } from "@/lib/server-data";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://fibernorth.com";

  const staticPages = [
    "",
    "/services",
    "/why-trenchless",
    "/fiber-construction",
    "/faq",
    "/projects",
    "/major-projects",
    "/fleet",
    "/service-area",
    "/about",
    "/employment",
    "/testimonials",
    "/blog",
    "/contact",
  ];

  const servicePages = SERVICES.map((s) => `/services/${s.slug}`);

  let blogPages: string[] = [];
  try {
    const posts = await getPublishedBlogPosts();
    blogPages = posts.map((p) => `/blog/${p.slug}`);
  } catch {
    // Firestore unavailable at build time — static pages still ship
  }

  return [...staticPages, ...servicePages, ...blogPages].map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.8,
  }));
}
