import { NextRequest, NextResponse } from "next/server";
import { getLiveRoster } from "@/lib/rosterStore";
import { getRosterStatuses } from "@/lib/mlb";

export const dynamic = "force-dynamic";

/**
 * GET /api/roster-status?user=<id>
 *
 * Resolves that person's CURRENT roster's active/IL/NA status live from the
 * MLB Stats API. Called on every "Pull today's lineup" alongside
 * /api/schedule so a same-day IL move or activation is caught automatically
 * — the `status` field hardcoded in lib/rosters.json is only a
 * same-day-offline fallback.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user");
  if (!userId) {
    return NextResponse.json({ error: "Missing ?user=<id>" }, { status: 400 });
  }
  const roster = await getLiveRoster(userId);
  if (!roster) {
    return NextResponse.json({ error: `No roster found for "${userId}"` }, { status: 404 });
  }

  try {
    const players = roster
      .filter((p) => p.mlbamId > 0) // skip unverified placeholder entries (mlbamId: 0)
      .map((p) => ({ mlbamId: p.mlbamId, mlbTeamId: p.mlbTeamId }));

    const statuses = await getRosterStatuses(players);
    return NextResponse.json({ statuses });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 502 });
  }
}
