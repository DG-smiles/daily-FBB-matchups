import { NextRequest, NextResponse } from "next/server";
import { getBatchSplit, getBatchRecentForm, VS_LHP, VS_RHP } from "@/lib/fangraphs";

export const dynamic = "force-dynamic";

/**
 * POST body: { fangraphsIds: number[], season: number, dateISO: string }
 *
 * Returns vs-LHP, vs-RHP, and trailing-30-day splits for every id passed,
 * all fetched in parallel — 3 outbound FanGraphs calls total, regardless
 * of how many hitters are in the roster.
 */
export async function POST(req: NextRequest) {
  try {
    const { fangraphsIds, season, dateISO } = await req.json();

    if (!Array.isArray(fangraphsIds) || fangraphsIds.length === 0) {
      return NextResponse.json({ error: "fangraphsIds must be a non-empty array" }, { status: 400 });
    }

    const [vsL, vsR, recent] = await Promise.all([
      getBatchSplit(fangraphsIds, season, VS_LHP),
      getBatchSplit(fangraphsIds, season, VS_RHP),
      getBatchRecentForm(fangraphsIds, season, dateISO),
    ]);

    return NextResponse.json({ vsL, vsR, recent });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 502 });
  }
}
