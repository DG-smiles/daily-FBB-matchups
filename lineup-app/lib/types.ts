// Core data shapes shared across the app.

export type Hand = "L" | "R" | "S"; // switch hitters use S

export interface Player {
  id: string; // slug, e.g. "riley-greene" — used as the React key / localStorage key
  name: string;
  mlbTeamId: number; // MLB Stats API team id, e.g. 116 for Tigers
  mlbTeamAbbrev: string; // e.g. "DET"
  eligiblePositions: string[]; // e.g. ["LF", "CF", "RF"]
  bats: Hand;
  mlbamId: number; // MLB Advanced Media person id (statsapi.mlb.com)
  fangraphsId: number; // FanGraphs player id (from fangraphs.com/players/.../<id>/...)
  status?: "active" | "IL" | "NA";
}

export interface ScheduleGame {
  gamePk: number;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamAbbrev: string;
  awayTeamAbbrev: string;
  homeProbablePitcher: ProbablePitcher | null;
  awayProbablePitcher: ProbablePitcher | null;
}

export interface ProbablePitcher {
  id: number;
  fullName: string;
  throws: Hand | null;
}

// What a hitter faces today, resolved from the schedule.
export interface TodaysMatchup {
  player: Player;
  opponentTeamAbbrev: string;
  opponentPitcher: ProbablePitcher | null;
  isHome: boolean;
}

// Computed split line for one hitter vs one hand (or one date range).
export interface SplitLine {
  mlbamId: number;
  PA: number;
  AB: number;
  OBP: number | null;
  SLG: number | null;
  OPS: number | null;
  AVG: number | null;
}

export interface LineupRecommendation {
  player: Player;
  opponentPitcher: ProbablePitcher | null;
  splitVsPitcherHand: SplitLine | null;
  splitVsOppositeHand: SplitLine | null;
  form30: SplitLine | null;
  form10: SplitLine | null;
  pitcherSplitVsBatterSide: SplitLine | null;
  sitScore: number | null; // 0-100, 100 = worst matchup, definite bench
  sitBreakdown: SitComponent[];
  note: string;
}

export interface SitComponent {
  label: string;
  ops: number | null;
  pa: number;
  qualityScore: number | null; // 0-100, higher = better for the batter
  baseWeight: number; // stated priority weight before confidence adjustment
  confidence: number; // 0-1, based on sample size
  effectiveWeight: number; // after confidence + renormalization
}
