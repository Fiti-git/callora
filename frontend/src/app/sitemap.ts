import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://callora.ai";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE_URL}/`, lastModified: now, priority: 1.0, changeFrequency: "weekly" },
    { url: `${BASE_URL}/privacy`, lastModified: now, priority: 0.4, changeFrequency: "monthly" },
    { url: `${BASE_URL}/terms`, lastModified: now, priority: 0.4, changeFrequency: "monthly" },
  ];
}
