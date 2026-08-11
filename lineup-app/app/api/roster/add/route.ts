import { NextRequest, NextResponse } from "next/server";
import { getPlayerInfo } from "@/lib/mlb";
import { getDisplayName } from "@/lib/rosters";
import { addPlayer } from "@/lib/rosterStore";
import { Player } from "@/lib/types";

export const dynamic = "force-dynamic";

function slugify(name: string, mlbamId: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base}-${mlbamId}`;
}

/**
 * POST /api/roster/add
 * Body: { userId: string, mlbamId: number, currentRoster: Player[] }
 *
 * currentRoster is the client's own up-to-date roster state (see
 * lib/rosterStore.ts for why this route trusts that instead of re-reading
 * Blob itself). Resolves the player's current team/position/bats fresh from
 * MLB (doesn't trust whatever the client sent about the player being added
 * — mlbamId is the only input taken as-is there), builds a full roster
 * entry, and writes currentRoster + that entry to Blob. No-op (not an
 * error) if already rostered.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId, mlbamId, currentRoster } = await req.json();
    if (!userId || !mlbamId || !Array.isArray(currentRoster)) {
      return NextResponse.json(
        { error: "Missing userId, mlbamId, or currentRoster" },
        { status: 400 }
      );
    }

    const displayName = getDisplayName(userId);
    if (!displayName) {
      return NextResponse.json({ error: `Unknown user "${userId}"` }, { status: 404 });
    }

    const info = await getPlayerInfo(mlbamId);
    if (!info) {
      return NextResponse.json(
        { error: `Couldn't resolve player ${mlbamId} (no current team on file)` },
        { status: 404 }
      );
    }

    const player: Player = {
      id: slugify(info.name, info.mlbamId),
      name: info.name,
      mlbTeamId: info.mlbTeamId,
      mlbTeamAbbrev: info.mlbTeamAbbrev,
      eligiblePositions: [info.position],
      bats: info.bats ?? "R",
      mlbamId: info.mlbamId,
      fangraphsId: 0,
    };

    const updated = await addPlayer(userId, displayName, currentRoster as Player[], player);
    return NextResponse.json({ roster: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
