import { NextRequest, NextResponse } from "next/server";
import { defaultRoster } from "@/lib/defaultRoster";
import { checkOwnerKey } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/roster
 *
 * Returns the hardcoded roster — but only to a request carrying the correct
 * x-owner-key header. Unlike a client-side "hide this in the UI" check, this
 * is the actual boundary: app/page.tsx no longer imports defaultRoster.ts
 * directly (that would ship every player's name into the JS bundle for
 * anyone who loads the page, regardless of what's rendered on screen). This
 * route is now the only path the roster data takes to a browser.
 */
export async function GET(req: NextRequest) {
  const denied = checkOwnerKey(req);
  if (denied) return denied;
  return NextResponse.json({ roster: defaultRoster });
}
