import { NextRequest, NextResponse } from "next/server";
import { getLiveRoster } from "@/lib/rosterStore";

export const dynamic = "force-dynamic";

/**
 * GET /api/roster?user=<id>
 *
 * One person's current roster — the live Blob copy if they've ever
 * added/dropped a player, otherwise the seed data from lib/rosters.json.
 * No access check — rosters aren't secret (see lib/rosters.json) — this
 * just keeps player data out of the client bundle for anyone who *hasn't*
 * picked a roster yet, and lets the whole friend group share one deployment.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user");
  if (!userId) {
    return NextResponse.json({ error: "Missing ?user=<id>" }, { status: 400 });
  }
  const players = await getLiveRoster(userId);
  if (!players) {
    return NextResponse.json({ error: `No roster found for "${userId}"` }, { status: 404 });
  }
  return NextResponse.json({ roster: players });
}
