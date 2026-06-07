import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://fibernorth.com";

  const staticPages = [
    "",
    "/services",
    "/why-trenchless",
    "/projects",
    "/major-projects",
    "/fleet",
    "/service-area",
    "/about",
    "/employment",
    "/blog",
    "/contact",
  ];

  return staticPages.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.8,
  }));
}
