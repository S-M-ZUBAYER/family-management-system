import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Family Management System",
    short_name: "Family",
    description: "Secure family management for members, events, Qurbani, communication, finance and family records.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f6f2",
    theme_color: "#153a5b",
    orientation: "any",
    lang: "bn",
    categories: ["lifestyle", "productivity", "social"],
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
    ],
  };
}
