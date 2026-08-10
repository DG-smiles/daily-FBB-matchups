import { NextRequest, NextResponse } from "next/server";
import { TEAM_ABBREV_BY_ID } from "@/lib/mlbTeams";
import { UniversePlayer } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MLB_BASE = "https://statsapi.mlb.com/api/v1";

// Simple in-memory cache, scoped to one warm serverless instance — resets on
// cold start, which is fine: this just avoids re-fetching MLB's full
// (~1,000+ player) list on every keystroke of a search across a warm
// instance's lifetime. Not a durable cache; that's not needed here.
let cache: { season: number; players: UniversePlayer[]; fetchedAt: number } | null = null;
const CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * GET /api/players?season=YYYY
 *
 * The full MLB hitter pool for a season — every hitter who appeared on a
 * roster, not just your team's. This is what the roster-manager's
 * add-a-player search draws from. Pitchers (primaryPosition "P") are
 * filtered out; two-way players and DH-primary guys are kept.
 *
 * Positions here are MLB's own single "primary position," not multi-slot
 * fantasy eligibility (Yahoo computes that from games actually started at
 * each position — MLB's public API doesn't expose an equivalent). A player
 * added here starts with one eligible position; add more by hand in
 * lib/rosters.json (or the live Blob copy) if your real Yahoo roster has
 * them qualified at more than one.
 */
export async function GET(req: NextRequest) {
  const seasonParam = req.nextUrl.searchParams.get("season");
  const season = seasonParam ? parseInt(seasonParam, 10) : new Date().getFullYear();

  if (cache && cache.season === season && Date.now() - cache.fetchedAt < CACHE_MS) {
    return NextResponse.json({ players: cache.players });
  }

  try {
    const url = `${MLB_BASE}/sports/1/players?season=${season}`;
    const res = await fetch(url, { next: { revalidate: 21600 } });
    if (!res.ok) {
      return NextResponse.json(
        { error: `MLB players request failed: ${res.status}` },
        { status: 502 }
      );
    }
    const data = await res.json();
    const people = (data.people ?? []) as any[];

    const players: UniversePlayer[] = people
      .filter((p) => p.primaryPosition?.abbreviation && p.primaryPosition.abbreviation !== "P")
      .filter((p) => p.currentTeam?.id)
      .map((p) => ({
        mlbamId: p.id,
        name: p.fullName,
        mlbTeamId: p.currentTeam.id,
        mlbTeamAbbrev: TEAM_ABBREV_BY_ID[p.currentTeam.id] ?? p.currentTeam.name ?? "?",
        position: p.primaryPosition.abbreviation,
        bats: (p.batSide?.code as UniversePlayer["bats"]) ?? null,
      }));

    cache = { season, players, fetchedAt: Date.now() };
    return NextResponse.json({ players });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 502 });
  }
}
