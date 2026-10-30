import type { MetadataRoute } from "next";
import { SERVICES } from "@/lib/constants";
import { TOWN_PAGES } from "@/lib/town-pages";
import { getPublishedBlogPosts, getVisibleTestimonials } from "@/lib/server-data";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://fibernorth.com";

  // /major-projects 301s to /fiber-construction; /testimonials is noindexed
  // until it has content, so neither belongs here.
  const staticPages = [
    "",
    "/services",
    "/directional-drilling",
    "/trenching",
    "/underground-utility-contractor",
    "/why-trenchless",
    "/campgrounds",
    "/for-contractors",
    "/business-internet",
    "/fiber-construction",
    "/faq",
    "/projects",
    "/fleet",
    "/service-area",
    "/about",
    "/employment",
    "/blog",
    "/contact",
    "/privacy",
  ];

  const servicePages = SERVICES.map((s) => `/services/${s.slug}`);
  const townPages = TOWN_PAGES.map((t) => `/directional-drilling/${t.slug}`);

  const entries: MetadataRoute.Sitemap = [...staticPages, ...servicePages, ...townPages].map(
    (path) => ({
      url: `${baseUrl}${path}`,
      changeFrequency: path === "" ? "weekly" : "monthly",
      priority: path === "" ? 1 : 0.8,
    })
  );

  try {
    const testimonials = await getVisibleTestimonials();
    if (testimonials.length > 0) {
      entries.push({
        url: `${baseUrl}/testimonials`,
        changeFrequency: "monthly",
        priority: 0.8,
      });
    }
  } catch {
    // Firestore unavailable at build time — leave it out
  }

  try {
    const posts = await getPublishedBlogPosts();
    for (const p of posts) {
      entries.push({
        url: `${baseUrl}/blog/${p.slug}`,
        // Real modification dates carry signal; a build-time timestamp on
        // every URL carries none.
        lastModified: p.updatedAt || p.publishedAt || undefined,
        changeFrequency: "monthly",
        priority: 0.8,
      });
    }
  } catch {
    // Firestore unavailable at build time — static pages still ship
  }

  return entries;
}
