import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/debug-mlb?player=<mlbamId>&type=splits|recent
 *
 * Returns the raw MLB Stats API response for one player, so if
 * getRecentForm()'s byDateRange call (unverified live, see lib/mlbSplits.ts)
 * doesn't return what's expected, you can see exactly what MLB sent back.
 */
export async function GET(req: NextRequest) {
  const player = req.nextUrl.searchParams.get("player");
  const type = req.nextUrl.searchParams.get("type") ?? "splits";

  if (!player) {
    return NextResponse.json({ error: "Missing ?player=<mlbamId>" }, { status: 400 });
  }

  const season = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const url =
    type === "recent"
      ? `https://statsapi.mlb.com/api/v1/people/${player}/stats?stats=byDateRange&group=hitting&startDate=${thirtyAgo}&endDate=${today}`
      : `https://statsapi.mlb.com/api/v1/people/${player}/stats?stats=statSplits&group=hitting&sitCodes=vl,vr&season=${season}`;

  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    const body = await res.text();
    return NextResponse.json({ url, status: res.status, body: JSON.parse(body) });
  } catch (err: any) {
    return NextResponse.json({ url, error: err.message }, { status: 502 });
  }
}
