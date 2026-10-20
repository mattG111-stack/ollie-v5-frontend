import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Apex Property",
    short_name: "Apex Property",
    description: "Property insights, deals and suburb trends from Apex.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: "#16181A",
    theme_color: "#16181A",
    icons: [
      { src: "/app-icon?size=192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon?size=512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon?size=512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
