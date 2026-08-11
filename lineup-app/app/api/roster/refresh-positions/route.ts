import { NextRequest, NextResponse } from "next/server";
import { getDisplayName } from "@/lib/rosters";
import { getPlayerInfo, getEligiblePositions } from "@/lib/mlb";
import { saveRoster } from "@/lib/rosterStore";
import { checkCooldown } from "@/lib/rateLimit";
import { Player } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // a full roster can be a few dozen MLB calls, fanned out in parallel

const REFRESH_COOLDOWN_MS = 60_000; // 1 per minute per person — this is the biggest fan-out action in the app

/**
 * POST /api/roster/refresh-positions
 * Body: { userId: string, currentRoster: Player[] }
 *
 * Re-resolves every player on the roster fresh from MLB — team, bats, and
 * (the main point) full multi-position eligibility via getEligiblePositions
 * (lib/mlb.ts). A single player's lookup failing doesn't fail the whole
 * refresh — that player's existing data is left untouched and everyone
 * else still updates. Saves the result directly (see lib/rosterStore.ts for
 * why this doesn't re-read Blob first) and returns the updated roster.
 *
 * Rate-limited to once per minute per person: up to ~19 players × up to 3
 * MLB calls each (team/position lookup + this-season and last-season
 * fielding stats) is the largest single burst of calls anywhere in this
 * app, and this button is easy to fat-finger twice.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId, currentRoster } = await req.json();
    if (!userId || !Array.isArray(currentRoster)) {
      return NextResponse.json({ error: "Missing userId or currentRoster" }, { status: 400 });
    }

    const displayName = getDisplayName(userId);
    if (!displayName) {
      return NextResponse.json({ error: `Unknown user "${userId}"` }, { status: 404 });
    }

    const cooldown = await checkCooldown(`refresh-positions-${userId}`, REFRESH_COOLDOWN_MS);
    if (!cooldown.allowed) {
      return NextResponse.json(
        {
          error: `Please wait ${Math.ceil(
            cooldown.retryAfterMs / 1000
          )}s before refreshing again.`,
        },
        { status: 429 }
      );
    }

    const season = new Date().getFullYear();

    const refreshed: Player[] = await Promise.all(
      (currentRoster as Player[]).map(async (p) => {
        if (!p.mlbamId || p.mlbamId <= 0) return p; // unresolved placeholder — nothing to look up
        try {
          const info = await getPlayerInfo(p.mlbamId);
          if (!info) return p; // couldn't resolve this one — leave them untouched, don't fail the batch
          const eligiblePositions = await getEligiblePositions(p.mlbamId, info.position, season);
          return {
            ...p,
            mlbTeamId: info.mlbTeamId,
            mlbTeamAbbrev: info.mlbTeamAbbrev,
            bats: info.bats ?? p.bats,
            eligiblePositions,
          };
        } catch {
          return p; // any failure for this one player — leave them untouched
        }
      })
    );

    await saveRoster(userId, displayName, refreshed);
    return NextResponse.json({ roster: refreshed });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
