import { NextRequest, NextResponse } from "next/server";
import { getDisplayName } from "@/lib/rosters";
import { dropPlayer } from "@/lib/rosterStore";

export const dynamic = "force-dynamic";

/**
 * POST /api/roster/drop
 * Body: { userId: string, playerId: string }
 *
 * playerId is the roster-local Player.id (e.g. "riley-greene"), not an
 * mlbamId. Current-state-only — dropping doesn't keep any history.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId, playerId } = await req.json();
    if (!userId || !playerId) {
      return NextResponse.json({ error: "Missing userId or playerId" }, { status: 400 });
    }

    const displayName = getDisplayName(userId);
    if (!displayName) {
      return NextResponse.json({ error: `Unknown user "${userId}"` }, { status: 404 });
    }

    const updated = await dropPlayer(userId, displayName, playerId);
    return NextResponse.json({ roster: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
