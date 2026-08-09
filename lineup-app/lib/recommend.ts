import { Player, ScheduleGame, SplitLine, LineupRecommendation } from "./types";
import { resolveOpponent } from "./mlb";

export function buildRecommendations(
  roster: Player[],
  games: ScheduleGame[],
  vsL: Record<number, SplitLine>,
  vsR: Record<number, SplitLine>,
  recent: Record<number, SplitLine>
): LineupRecommendation[] {
  const active = roster.filter((p) => p.status !== "IL" && p.status !== "NA");

  return active.map((player) => {
    const matchup = resolveOpponent(games, player.mlbTeamId);
    const opponentPitcher = matchup?.opponentPitcher ?? null;
    const pitcherHand = opponentPitcher?.throws;

    // Switch hitters always take the split opposite the pitcher's hand.
    const effectiveBatSide =
      player.bats === "S" ? (pitcherHand === "L" ? "R" : "L") : player.bats;

    const splitVsPitcherHand =
      pitcherHand === "L" ? vsL[player.mlbamId] ?? null : vsR[player.mlbamId] ?? null;
    const splitVsOppositeHand =
      pitcherHand === "L" ? vsR[player.mlbamId] ?? null : vsL[player.mlbamId] ?? null;

    const monthOPS = recent[player.mlbamId]?.OPS ?? null;

    let note = "No game today.";
    if (!matchup) {
      note = "Off day — not in today's schedule.";
    } else if (!opponentPitcher) {
      note = "Opponent starter not yet announced.";
    } else if (!pitcherHand) {
      note = `Facing ${opponentPitcher.fullName} — throwing hand not confirmed.`;
    } else {
      const opsTxt = splitVsPitcherHand?.OPS != null ? splitVsPitcherHand.OPS.toFixed(3) : "no data";
      const formTxt = monthOPS != null ? ` | last 30 days: ${monthOPS.toFixed(3)} OPS` : "";
      note = `Faces ${opponentPitcher.fullName} (${pitcherHand}HP) — ${effectiveBatSide === player.bats ? "" : "(switch, batting " + effectiveBatSide + ") "}${opsTxt} OPS vs ${pitcherHand}HP this season${formTxt}`;
    }

    return {
      player,
      opponentPitcher,
      splitVsPitcherHand,
      splitVsOppositeHand,
      monthOPS,
      note,
    };
  });
}

/** Simple sort key for "who should start" ranking within a position group. */
export function recommendationScore(rec: LineupRecommendation): number {
  const seasonOPS = rec.splitVsPitcherHand?.OPS ?? 0;
  const formOPS = rec.monthOPS ?? seasonOPS;
  // Weight season-vs-hand more heavily than recent form, per the roster's stated priority.
  return seasonOPS * 0.7 + formOPS * 0.3;
}
