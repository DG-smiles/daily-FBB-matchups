import type { MetadataRoute } from "next";

// Auto-detected by Next.js and served at /manifest.webmanifest, with the
// <link rel="manifest"> tag added to <head> automatically — same
// zero-wiring convention as app/icon.png and app/apple-icon.png.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Daily Lineup Analysis",
    short_name: "Lineup",
    description: "Daily platoon-matchup lineup recommendations, from MLB's own Stats API.",
    start_url: "/",
    display: "standalone",
    background_color: "#0e1a12", // matches app/globals.css --ink
    theme_color: "#0e1a12",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
