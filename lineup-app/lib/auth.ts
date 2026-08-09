import { NextRequest, NextResponse } from "next/server";

/**
 * Minimal owner-only gate for roster-revealing API routes.
 *
 * This is NOT real per-user auth — it's one shared secret that keeps the
 * hardcoded roster in lib/defaultRoster.ts from shipping to anyone who
 * opens the app link, until real accounts (see the multi-user roadmap)
 * replace this entirely. It's intentionally simple: one key, checked
 * server-side, never bundled to the client.
 *
 * SETUP: set OWNER_ACCESS_KEY in your Vercel project's environment
 * variables — a long random string, NOT prefixed with NEXT_PUBLIC_ (that
 * prefix ships a variable's value into the browser bundle; omitting it
 * keeps this one server-only, which is the whole point). Then open the
 * app once on your phone as:
 *   https://your-app.vercel.app/?key=<that same string>
 * page.tsx stores it in localStorage on first visit and sends it as the
 * x-owner-key header on every roster-related request after that — you
 * won't need to pass it again on that device.
 */
export function checkOwnerKey(req: NextRequest): NextResponse | null {
  const configured = process.env.OWNER_ACCESS_KEY;
  if (!configured) {
    // Fail closed: an unconfigured server should show nobody's roster,
    // not everybody's.
    return NextResponse.json(
      { error: "Server is missing OWNER_ACCESS_KEY — roster access is disabled until it's set." },
      { status: 500 }
    );
  }
  const provided = req.headers.get("x-owner-key");
  if (!provided || provided !== configured) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null; // null = access granted, caller should proceed
}
