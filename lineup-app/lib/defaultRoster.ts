import { Player } from "./types";

/**
 * Standard MLB Stats API team IDs (stable, documented, don't change).
 * Reference if you add players from teams not already below.
 */
export const MLB_TEAM_IDS: Record<string, number> = {
  ARI: 109, ATL: 144, BAL: 110, BOS: 111, CHC: 112, CWS: 145, CIN: 113,
  CLE: 114, COL: 115, DET: 116, HOU: 117, KC: 118, LAA: 108, LAD: 119,
  MIA: 146, MIL: 158, MIN: 142, NYM: 121, NYY: 147, ATH: 133, PHI: 143,
  PIT: 134, SD: 135, SEA: 136, SF: 137, STL: 138, TB: 139, TEX: 140,
  TOR: 141, WSH: 120,
};

/**
 * Default roster: "Men of Girth" as configured Aug 2026.
 * Edit this list directly to add/drop players — see README for how to find
 * the mlbamId and fangraphsId for a new player.
 *
 * NOTE: bats/fangraphsId marked "VERIFY" below were not confirmed live
 * (built without internet access) — double check on FanGraphs/MLB.com
 * before trusting the split data for that player.
 */
export const defaultRoster: Player[] = [
  {
    id: "riley-greene", name: "R. Greene", mlbTeamId: MLB_TEAM_IDS.DET, mlbTeamAbbrev: "DET",
    eligiblePositions: ["LF", "CF", "RF"], bats: "L", mlbamId: 682985, fangraphsId: 25976,
  },
  {
    id: "heliot-ramos", name: "H. Ramos", mlbTeamId: MLB_TEAM_IDS.NYY, mlbTeamAbbrev: "NYY",
    eligiblePositions: ["LF", "CF", "RF"], bats: "R", mlbamId: 671218, fangraphsId: 22515,
  },
  {
    id: "jj-bleday", name: "J. Bleday", mlbTeamId: MLB_TEAM_IDS.CIN, mlbTeamAbbrev: "CIN",
    eligiblePositions: ["LF", "CF", "RF"], bats: "L", mlbamId: 668709, fangraphsId: 26368,
  },
  {
    id: "jac-caglianone", name: "J. Caglianone", mlbTeamId: MLB_TEAM_IDS.KC, mlbTeamAbbrev: "KC",
    eligiblePositions: ["1B", "RF"], bats: "L", mlbamId: 695506, fangraphsId: 35041,
  },
  {
    id: "max-clark", name: "M. Clark", mlbTeamId: MLB_TEAM_IDS.DET, mlbTeamAbbrev: "DET",
    eligiblePositions: ["CF"], bats: "L" /* VERIFY */, mlbamId: 703601,
    fangraphsId: 0 /* VERIFY: not confirmed — check fangraphs.com/players/max-clark */,
  },
  {
    id: "gabriel-moreno", name: "G. Moreno", mlbTeamId: MLB_TEAM_IDS.ARI, mlbTeamAbbrev: "ARI",
    eligiblePositions: ["C"], bats: "R", mlbamId: 672515, fangraphsId: 22664,
  },
  {
    id: "ivan-herrera", name: "I. Herrera", mlbTeamId: MLB_TEAM_IDS.STL, mlbTeamAbbrev: "STL",
    eligiblePositions: ["C"], bats: "S" /* VERIFY: switch hitter */, mlbamId: 671056, fangraphsId: 20599,
  },
  {
    id: "alec-burleson", name: "A. Burleson", mlbTeamId: MLB_TEAM_IDS.STL, mlbTeamAbbrev: "STL",
    eligiblePositions: ["1B", "LF", "RF"], bats: "L", mlbamId: 676475, fangraphsId: 27615,
  },
  {
    id: "jackson-holliday", name: "J. Holliday", mlbTeamId: MLB_TEAM_IDS.BAL, mlbTeamAbbrev: "BAL",
    eligiblePositions: ["2B", "SS"], bats: "L", mlbamId: 702616, fangraphsId: 31781,
  },
  {
    id: "jazz-chisholm", name: "J. Chisholm Jr.", mlbTeamId: MLB_TEAM_IDS.NYY, mlbTeamAbbrev: "NYY",
    eligiblePositions: ["2B", "3B"], bats: "L", mlbamId: 665862, fangraphsId: 20454,
  },
  {
    id: "mookie-betts", name: "M. Betts", mlbTeamId: MLB_TEAM_IDS.LAD, mlbTeamAbbrev: "LAD",
    eligiblePositions: ["SS"], bats: "R", mlbamId: 605141, fangraphsId: 13611,
  },
  {
    id: "colson-montgomery", name: "C. Montgomery", mlbTeamId: MLB_TEAM_IDS.CWS, mlbTeamAbbrev: "CWS",
    eligiblePositions: ["3B", "SS"], bats: "L", mlbamId: 695657, fangraphsId: 29712,
  },
  {
    id: "zach-neto", name: "Z. Neto", mlbTeamId: MLB_TEAM_IDS.LAA, mlbTeamAbbrev: "LAA",
    eligiblePositions: ["SS"], bats: "R", mlbamId: 687263, fangraphsId: 31347,
  },
  {
    id: "cole-young", name: "C. Young", mlbTeamId: MLB_TEAM_IDS.SEA, mlbTeamAbbrev: "SEA",
    eligiblePositions: ["2B"], bats: "L" /* VERIFY */, mlbamId: 702284, fangraphsId: 31680,
  },
  {
    id: "dominic-canzone", name: "D. Canzone", mlbTeamId: MLB_TEAM_IDS.SEA, mlbTeamAbbrev: "SEA",
    eligiblePositions: ["LF", "RF"], bats: "L", mlbamId: 686527, fangraphsId: 26438,
  },
  {
    id: "brendan-donovan", name: "B. Donovan", mlbTeamId: MLB_TEAM_IDS.SEA, mlbTeamAbbrev: "SEA",
    eligiblePositions: ["2B", "3B", "SS", "LF"], bats: "L", mlbamId: 680977, fangraphsId: 24679,
  },
  {
    id: "spencer-horwitz", name: "S. Horwitz", mlbTeamId: MLB_TEAM_IDS.PIT, mlbTeamAbbrev: "PIT",
    eligiblePositions: ["1B"], bats: "L", mlbamId: 687462, fangraphsId: 26477,
  },
  // IL / NA — excluded from daily lineup decisions but kept here for roster completeness.
  {
    id: "byron-buxton", name: "B. Buxton", mlbTeamId: MLB_TEAM_IDS.MIN, mlbTeamAbbrev: "MIN",
    eligiblePositions: ["CF"], bats: "R", mlbamId: 621439, fangraphsId: 14161, status: "IL",
  },
  {
    id: "walker-jenkins", name: "W. Jenkins", mlbTeamId: MLB_TEAM_IDS.MIN, mlbTeamAbbrev: "MIN",
    eligiblePositions: ["LF", "CF", "RF"], bats: "L" /* VERIFY */, mlbamId: 0 /* VERIFY */,
    fangraphsId: 0 /* VERIFY */, status: "NA",
  },
];
