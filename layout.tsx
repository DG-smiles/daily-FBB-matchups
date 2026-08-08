import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Men of Girth — Daily Lineup",
  description: "Daily platoon-matchup lineup recommendations",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
