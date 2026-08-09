import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Men of Girth — Daily Lineup",
  description: "Daily platoon-matchup lineup recommendations",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    // Short label under the home-screen icon — "Men of Girth — Daily Lineup"
    // would just get truncated, same as Yahoo Fantasy's own icon label does.
    title: "Lineup",
  },
};

// theme_color intentionally matches the app's own dark-green chrome (not the
// icon's purple) — this is what colors the browser UI / splash once the app
// is actually open, so it should match what's on screen, not the home-screen
// badge. Easy to change to the icon's purple (#6b18e0) if you'd rather have
// that carry through.
export const viewport: Viewport = {
  themeColor: "#0e1a12",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
