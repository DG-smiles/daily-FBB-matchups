/**
 * Standard MLB Stats API team IDs (stable, documented, don't change).
 * Reference this when adding a player to lib/rosters.json.
 */
export const MLB_TEAM_IDS: Record<string, number> = {
  ARI: 109, ATL: 144, BAL: 110, BOS: 111, CHC: 112, CWS: 145, CIN: 113,
  CLE: 114, COL: 115, DET: 116, HOU: 117, KC: 118, LAA: 108, LAD: 119,
  MIA: 146, MIL: 158, MIN: 142, NYM: 121, NYY: 147, ATH: 133, PHI: 143,
  PIT: 134, SD: 135, SEA: 136, SF: 137, STL: 138, TB: 139, TEX: 140,
  TOR: 141, WSH: 120,
};

/** Reverse of MLB_TEAM_IDS — team id -> abbreviation. Built once here so
 * lib/mlb.ts and app/api/players/route.ts share one definition instead of
 * each rebuilding their own. */
export const TEAM_ABBREV_BY_ID: Record<number, string> = Object.fromEntries(
  Object.entries(MLB_TEAM_IDS).map(([abbrev, id]) => [id, abbrev])
);
