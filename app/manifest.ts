import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Olie.co.nz",
    short_name: "Olie.co.nz",
    description: "Property insights, deals and suburb trends. Powered by Apex.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: "#252728",
    theme_color: "#252728",
    icons: [
      { src: "/app-icon?size=192&v=teal-1", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon?size=512&v=teal-1", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon?size=512&v=teal-1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
