import { NextRequest, NextResponse } from "next/server";
import { defaultRoster } from "@/lib/defaultRoster";
import { getPlatoonSplits, getRecentForm } from "@/lib/mlbSplits";
import { SplitLine } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST body: { mlbamIds: number[], season: number, dateISO: string }
 *
 * One request per hitter to MLB's own stats endpoint (platoon split +
 * recent form fetched in parallel per player), all players run concurrently
 * via Promise.allSettled so one failure doesn't take down the whole pull.
 */
export async function POST(req: NextRequest) {
  try {
    const { mlbamIds, season, dateISO } = await req.json();
    if (!Array.isArray(mlbamIds) || mlbamIds.length === 0) {
      return NextResponse.json({ error: "mlbamIds must be a non-empty array" }, { status: 400 });
    }

    const players = defaultRoster.filter((p) => mlbamIds.includes(p.mlbamId) && p.mlbamId > 0);

    const results = await Promise.allSettled(
      players.map(async (p) => {
        const [platoon, recent] = await Promise.all([
          getPlatoonSplits(p.mlbamId, season),
          getRecentForm(p.mlbamId, dateISO),
        ]);
        return { player: p, platoon, recent };
      })
    );

    const vsL: Record<number, SplitLine> = {};
    const vsR: Record<number, SplitLine> = {};
    const recent: Record<number, SplitLine> = {};
    const errors: Record<string, string> = {};

    results.forEach((result, i) => {
      const player = players[i];
      if (result.status === "fulfilled") {
        if (result.value.platoon.vsL) vsL[player.mlbamId] = result.value.platoon.vsL;
        if (result.value.platoon.vsR) vsR[player.mlbamId] = result.value.platoon.vsR;
        if (result.value.recent) recent[player.mlbamId] = result.value.recent;
      } else {
        errors[player.name] = String(result.reason?.message ?? result.reason);
      }
    });

    return NextResponse.json({ vsL, vsR, recent, errors });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 502 });
  }
}
