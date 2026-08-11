import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/debug-mlb?player=<mlbamId>&type=splits|recent|fielding&group=hitting|pitching&days=30&season=YYYY
 *
 * Returns the raw MLB Stats API response for one player/pitcher, so if
 * getRecentForm(), getPitcherPlatoonSplits(), or getEligiblePositions()
 * (the fielding-by-position lookup, least-verified of the bunch — built
 * without a way to hit the live API first) don't return what's expected,
 * you can see exactly what MLB sent back.
 */
export async function GET(req: NextRequest) {
  const player = req.nextUrl.searchParams.get("player");
  const type = req.nextUrl.searchParams.get("type") ?? "splits";
  const group = req.nextUrl.searchParams.get("group") ?? "hitting";
  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10);
  const season = req.nextUrl.searchParams.get("season") ?? String(new Date().getFullYear());

  if (!player) {
    return NextResponse.json({ error: "Missing ?player=<mlbamId>" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const url =
    type === "recent"
      ? `https://statsapi.mlb.com/api/v1/people/${player}/stats?stats=byDateRange&group=${group}&startDate=${start}&endDate=${today}`
      : type === "fielding"
      ? `https://statsapi.mlb.com/api/v1/people/${player}/stats?stats=season&group=fielding&season=${season}`
      : `https://statsapi.mlb.com/api/v1/people/${player}/stats?stats=statSplits&group=${group}&sitCodes=vl,vr&season=${season}`;

  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    const body = await res.text();
    return NextResponse.json({ url, status: res.status, body: JSON.parse(body) });
  } catch (err: any) {
    return NextResponse.json({ url, error: err.message }, { status: 502 });
  }
}
