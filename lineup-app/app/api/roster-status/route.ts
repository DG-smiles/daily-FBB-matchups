import { NextRequest, NextResponse } from "next/server";
import { defaultRoster } from "@/lib/defaultRoster";
import { getRosterStatuses } from "@/lib/mlb";
import { checkOwnerKey } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/roster-status
 *
 * Resolves every rostered player's CURRENT active/IL/NA status live from the
 * MLB Stats API. Called on every "Pull today's lineup" alongside /api/schedule
 * so a same-day IL move or activation is caught automatically — the `status`
 * field hardcoded in defaultRoster.ts is only a same-day-offline fallback.
 *
 * Gated the same as /api/roster since the response is keyed by this
 * roster's specific player ids.
 */
export async function GET(req: NextRequest) {
  const denied = checkOwnerKey(req);
  if (denied) return denied;
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
