import { NextRequest, NextResponse } from "next/server";
import { getDisplayName } from "@/lib/rosters";
import { dropPlayer } from "@/lib/rosterStore";
import { Player } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/roster/drop
 * Body: { userId: string, playerId: string, currentRoster: Player[] }
 *
 * playerId is the roster-local Player.id (e.g. "riley-greene"), not an
 * mlbamId. currentRoster is the client's own up-to-date roster state — see
 * lib/rosterStore.ts for why this route trusts that instead of re-reading
 * Blob itself. Current-state-only — dropping doesn't keep any history.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId, playerId, currentRoster } = await req.json();
    if (!userId || !playerId || !Array.isArray(currentRoster)) {
      return NextResponse.json(
        { error: "Missing userId, playerId, or currentRoster" },
        { status: 400 }
      );
    }

    const displayName = getDisplayName(userId);
    if (!displayName) {
      return NextResponse.json({ error: `Unknown user "${userId}"` }, { status: 404 });
    }

    const updated = await dropPlayer(userId, displayName, currentRoster as Player[], playerId);
    return NextResponse.json({ roster: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
