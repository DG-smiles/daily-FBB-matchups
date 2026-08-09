import { NextRequest, NextResponse } from "next/server";
import { defaultRoster } from "@/lib/defaultRoster";
import { getPlatoonSplits, getPitcherPlatoonSplits, getRecentForm } from "@/lib/mlbSplits";
import { SplitLine } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST body: { mlbamIds: number[], pitcherMlbamIds: number[], season: number, dateISO: string }
 *
 * Per hitter (3 calls, run concurrently): season platoon split, 30-day form,
 * 10-day form.
 * Per unique opposing pitcher (1 call): season platoon split allowed.
 * Every player/pitcher runs in parallel via Promise.allSettled.
 */
export async function POST(req: NextRequest) {
  try {
    const { mlbamIds, pitcherMlbamIds, season, dateISO } = await req.json();
    if (!Array.isArray(mlbamIds) || mlbamIds.length === 0) {
      return NextResponse.json({ error: "mlbamIds must be a non-empty array" }, { status: 400 });
    }

    const players = defaultRoster.filter((p) => mlbamIds.includes(p.mlbamId) && p.mlbamId > 0);
    const pitcherIds: number[] = Array.isArray(pitcherMlbamIds) ? pitcherMlbamIds : [];

    const [hitterResults, pitcherResults] = await Promise.all([
      Promise.allSettled(
        players.map(async (p) => {
          const [platoon, form30, form10] = await Promise.all([
            getPlatoonSplits(p.mlbamId, season),
            getRecentForm(p.mlbamId, dateISO, 30),
            getRecentForm(p.mlbamId, dateISO, 10),
          ]);
          return { mlbamId: p.mlbamId, platoon, form30, form10 };
        })
      ),
      Promise.allSettled(
        pitcherIds.map(async (id) => ({ id, splits: await getPitcherPlatoonSplits(id, season) }))
      ),
    ]);

    const vsL: Record<number, SplitLine> = {};
    const vsR: Record<number, SplitLine> = {};
    const form30: Record<number, SplitLine> = {};
    const form10: Record<number, SplitLine> = {};
    const errors: Record<string, string> = {};

    hitterResults.forEach((result, i) => {
      const player = players[i];
      if (result.status === "fulfilled") {
        if (result.value.platoon.vsL) vsL[player.mlbamId] = result.value.platoon.vsL;
        if (result.value.platoon.vsR) vsR[player.mlbamId] = result.value.platoon.vsR;
        if (result.value.form30) form30[player.mlbamId] = result.value.form30;
        if (result.value.form10) form10[player.mlbamId] = result.value.form10;
      } else {
        errors[player.name] = String(result.reason?.message ?? result.reason);
      }
    });

    const pitcherVsL: Record<number, SplitLine> = {};
    const pitcherVsR: Record<number, SplitLine> = {};
    pitcherResults.forEach((result, i) => {
      const id = pitcherIds[i];
      if (result.status === "fulfilled") {
        if (result.value.splits.vsL) pitcherVsL[id] = result.value.splits.vsL;
        if (result.value.splits.vsR) pitcherVsR[id] = result.value.splits.vsR;
      } else {
        errors[`pitcher:${id}`] = String(result.reason?.message ?? result.reason);
      }
    });

    return NextResponse.json({ vsL, vsR, form30, form10, pitcherVsL, pitcherVsR, errors });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 502 });
  }
}
