import { SplitLine } from "./types";

const MLB_BASE = "https://statsapi.mlb.com/api/v1";

/**
 * CONFIRMED WORKING (tested live, not guessed): MLB's own Stats API supports
 * platoon splits directly, e.g.:
 *   /people/605612/stats?stats=statSplits&group=hitting&sitCodes=vl,vr&season=2023
 * returns real vs-L / vs-R rows with `ops`, `obp`, `slg` etc. as direct fields.
 *
 * NOTE: earlier attempts to get this via /people?hydrate=stats(...) on the
 * search endpoint returned no stats at all — it has to be the direct
 * /people/{id}/stats path, not the hydrate-on-search path.
 *
 * This is one fetch per player (no confirmed batch-multiple-players variant
 * exists for this endpoint), but it's MLB's own public API — not a scraped
 * page that can be blocked, so it's the more reliable bet even at the same
 * call count.
 */

interface MlbStatSplit {
  split: { code: string; description: string };
  stat: {
    plateAppearances?: number;
    atBats?: number;
    obp?: string;
    slg?: string;
    ops?: string;
    avg?: string;
  };
}

async function fetchStatsApi(url: string): Promise<any> {
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    throw new Error(`MLB stats request failed: ${res.status} — ${url}`);
  }
  return res.json();
}

function toSplitLine(row: MlbStatSplit | undefined, mlbamId: number): SplitLine | null {
  if (!row) return null;
  const s = row.stat;
  return {
    mlbamId,
    PA: s.plateAppearances ?? 0,
    AB: s.atBats ?? 0,
    OBP: s.obp != null ? parseFloat(s.obp) : null,
    SLG: s.slg != null ? parseFloat(s.slg) : null,
    OPS: s.ops != null ? parseFloat(s.ops) : null,
    AVG: s.avg != null ? parseFloat(s.avg) : null,
  };
}

/** vs-LHP and vs-RHP season splits for one hitter, from a single request. */
export async function getPlatoonSplits(
  mlbamId: number,
  season: number
): Promise<{ vsL: SplitLine | null; vsR: SplitLine | null }> {
  const url = `${MLB_BASE}/people/${mlbamId}/stats?stats=statSplits&group=hitting&sitCodes=vl,vr&season=${season}`;
  const data = await fetchStatsApi(url);
  const splits: MlbStatSplit[] = data.stats?.[0]?.splits ?? [];
  return {
    vsL: toSplitLine(splits.find((s) => s.split.code === "vl"), mlbamId),
    vsR: toSplitLine(splits.find((s) => s.split.code === "vr"), mlbamId),
  };
}

/**
 * vs-LHB and vs-RHB season splits for one PITCHER — i.e. OPS *allowed* to
 * left-handed and right-handed batters. Same endpoint family as batter
 * splits, just group=pitching. NOTE: unverified live (the batter-group call
 * was tested directly; this one wasn't) — check /api/debug-mlb?player=<id>&group=pitching
 * if it comes back empty.
 */
export async function getPitcherPlatoonSplits(
  mlbamId: number,
  season: number
): Promise<{ vsL: SplitLine | null; vsR: SplitLine | null }> {
  const url = `${MLB_BASE}/people/${mlbamId}/stats?stats=statSplits&group=pitching&sitCodes=vl,vr&season=${season}`;
  const data = await fetchStatsApi(url);
  const splits: MlbStatSplit[] = data.stats?.[0]?.splits ?? [];
  return {
    vsL: toSplitLine(splits.find((s) => s.split.code === "vl"), mlbamId),
    vsR: toSplitLine(splits.find((s) => s.split.code === "vr"), mlbamId),
  };
}

/**
 * Trailing-N-day form via the same stats family, using byDateRange instead
 * of statSplits. Same endpoint shape as the confirmed-working call above,
 * but this specific statType wasn't tested live — if it 400s or comes back
 * empty, check /api/debug-mlb?player=<mlbamId> and we'll adjust.
 */
export async function getRecentForm(
  mlbamId: number,
  endDateISO: string,
  days = 30
): Promise<SplitLine | null> {
  const end = new Date(endDateISO);
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  const startISO = start.toISOString().slice(0, 10);

  const url = `${MLB_BASE}/people/${mlbamId}/stats?stats=byDateRange&group=hitting&startDate=${startISO}&endDate=${endDateISO}`;
  const data = await fetchStatsApi(url);
  const splits: MlbStatSplit[] = data.stats?.[0]?.splits ?? [];
  // byDateRange typically returns a single split with no "code" — just take the first.
  return toSplitLine(splits[0], mlbamId);
}
