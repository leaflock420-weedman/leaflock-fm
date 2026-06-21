import type { MetadataRoute } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LeafLock FM 104.2",
    short_name: "LeafLock FM",
    description: "24/7 radio from LeafLock — stay locked.",
    start_url: appUrl ? `${appUrl}/fm` : "/fm",
    scope: appUrl ? `${appUrl}/` : "/",
    id: appUrl ? `${appUrl}/fm` : "/fm",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#10b981",
    categories: ["music", "entertainment"],
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png"
      }
    ]
  };
}