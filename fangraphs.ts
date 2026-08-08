import { SplitLine } from "./types";

const FG_API = "https://www.fangraphs.com/api/leaders/major-league/data";

/**
 * These headers are the likely fix for the 500 error hit when calling this
 * endpoint from a bare tool without a browser-like request. If FanGraphs
 * still rejects this from Vercel's servers, try adding a real 'cookie'
 * header captured from a logged-out browser session (see README).
 */
const FG_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://www.fangraphs.com/leaders/major-league",
};

/** FanGraphs' "month" param doubles as a split code. 13 = vs LHP, 14 = vs RHP. */
export const VS_LHP = 13;
export const VS_RHP = 14;

interface FgRow {
  playerid: number;
  PA: number;
  AB: number;
  OBP: number;
  SLG: number;
  OPS?: number;
  AVG: number;
}

/**
 * ONE call: batch-pull a platoon split (vs L or vs R) for every hitter
 * whose fangraphsId is passed in. Returns a map keyed by fangraphsId.
 */
export async function getBatchSplit(
  fangraphsIds: number[],
  season: number,
  splitCode: typeof VS_LHP | typeof VS_RHP
): Promise<Record<number, SplitLine>> {
  const ids = fangraphsIds.filter((id) => id > 0);
  if (ids.length === 0) return {};

  const params = new URLSearchParams({
    pos: "all",
    stats: "bat",
    lg: "all",
    season: String(season),
    season1: String(season),
    ind: "0",
    qual: "0",
    type: "1", // "Advanced" stat group — includes OBP/SLG/OPS directly
    month: String(splitCode),
    pageitems: "500000",
    players: ids.join(","),
  });

  const res = await fetch(`${FG_API}?${params.toString()}`, {
    headers: FG_HEADERS,
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`FanGraphs split request failed: ${res.status}`);
  }

  const json = await res.json();
  const rows: FgRow[] = json.data ?? [];

  const out: Record<number, SplitLine> = {};
  for (const row of rows) {
    const obp = numOrNull(row.OBP);
    const slg = numOrNull(row.SLG);
    out[row.playerid] = {
      fangraphsId: row.playerid,
      PA: row.PA ?? 0,
      AB: row.AB ?? 0,
      OBP: obp,
      SLG: slg,
      OPS: row.OPS != null ? numOrNull(row.OPS) : obp != null && slg != null ? round3(obp + slg) : null,
      AVG: numOrNull(row.AVG),
    };
  }
  return out;
}

/**
 * ONE call: batch-pull trailing-30-day form for every hitter, using a
 * custom date range instead of FanGraphs' calendar-month buckets (which
 * don't line up cleanly with "today minus 30 days").
 */
export async function getBatchRecentForm(
  fangraphsIds: number[],
  season: number,
  endDateISO: string
): Promise<Record<number, SplitLine>> {
  const ids = fangraphsIds.filter((id) => id > 0);
  if (ids.length === 0) return {};

  const end = new Date(endDateISO);
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  const startISO = start.toISOString().slice(0, 10);

  const params = new URLSearchParams({
    pos: "all",
    stats: "bat",
    lg: "all",
    season: String(season),
    season1: String(season),
    ind: "0",
    qual: "0",
    type: "1",
    month: "1000", // "1000" = custom date range mode in FanGraphs' leaderboard API
    startdate: startISO,
    enddate: endDateISO,
    pageitems: "500000",
    players: ids.join(","),
  });

  const res = await fetch(`${FG_API}?${params.toString()}`, {
    headers: FG_HEADERS,
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`FanGraphs recent-form request failed: ${res.status}`);
  }

  const json = await res.json();
  const rows: FgRow[] = json.data ?? [];

  const out: Record<number, SplitLine> = {};
  for (const row of rows) {
    const obp = numOrNull(row.OBP);
    const slg = numOrNull(row.SLG);
    out[row.playerid] = {
      fangraphsId: row.playerid,
      PA: row.PA ?? 0,
      AB: row.AB ?? 0,
      OBP: obp,
      SLG: slg,
      OPS: row.OPS != null ? numOrNull(row.OPS) : obp != null && slg != null ? round3(obp + slg) : null,
      AVG: numOrNull(row.AVG),
    };
  }
  return out;
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
