import { NextResponse } from "next/server";
import { defaultRoster } from "@/lib/defaultRoster";
import { getRosterStatuses } from "@/lib/mlb";

export const dynamic = "force-dynamic";

/**
 * GET /api/roster-status
 *
 * Resolves every rostered player's CURRENT active/IL/NA status live from the
 * MLB Stats API. Called on every "Pull today's lineup" alongside /api/schedule
 * so a same-day IL move or activation is caught automatically — the `status`
 * field hardcoded in defaultRoster.ts is only a same-day-offline fallback.
 */
export async function GET() {
  try {
    const players = defaultRoster
      .filter((p) => p.mlbamId > 0) // skip unverified placeholder entries (mlbamId: 0)
      .map((p) => ({ mlbamId: p.mlbamId, mlbTeamId: p.mlbTeamId }));

    const statuses = await getRosterStatuses(players);
    return NextResponse.json({ statuses });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 502 });
  }
}
