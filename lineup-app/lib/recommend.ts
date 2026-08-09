import { Player, ScheduleGame, SplitLine, LineupRecommendation, SitComponent } from "./types";
import { resolveOpponent } from "./mlb";

// OPS-to-quality mapping: .500 OPS -> 0, 1.100 OPS -> 100, linear between, clamped.
const OPS_FLOOR = 0.5;
const OPS_CEIL = 1.1;

// PA needed for FULL confidence in each component. Below this, confidence
// scales down linearly toward 0 and the component's weight gets
// redistributed to the other, more-reliable components.
const PA_THRESHOLDS = {
  seasonBatter: 15, // "several games worth" for a batter's own season split
  pitcherQuality: 15, // same idea, batters-faced-from-that-side for the pitcher
  form30: 20,
  form10: 10, // explicit: <10 PA in the 10-day window gets downweighted
};

// Stated priority order, as base weights before confidence adjustment.
const BASE_WEIGHTS = {
  seasonBatter: 0.4,
  pitcherQuality: 0.3,
  form30: 0.2,
  form10: 0.1,
};

function toQualityScore(ops: number | null): number | null {
  if (ops == null) return null;
  const pct = ((ops - OPS_FLOOR) / (OPS_CEIL - OPS_FLOOR)) * 100;
  return Math.max(0, Math.min(100, pct));
}

function confidence(pa: number | null | undefined, threshold: number): number {
  if (!pa || pa <= 0) return 0;
  return Math.max(0, Math.min(1, pa / threshold));
}

export function buildRecommendations(
  roster: Player[],
  games: ScheduleGame[],
  vsL: Record<number, SplitLine>,
  vsR: Record<number, SplitLine>,
  form30: Record<number, SplitLine>,
  form10: Record<number, SplitLine>,
  pitcherVsL: Record<number, SplitLine>,
  pitcherVsR: Record<number, SplitLine>
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

    // Pitcher's OPS *allowed* to the batter's side — opposite lookup direction
    // from the batter's own split (keyed by pitcher id, indexed by batter side).
    const pitcherSplitVsBatterSide = opponentPitcher
      ? effectiveBatSide === "L"
        ? pitcherVsL[opponentPitcher.id] ?? null
        : pitcherVsR[opponentPitcher.id] ?? null
      : null;

    const batterForm30 = form30[player.mlbamId] ?? null;
    const batterForm10 = form10[player.mlbamId] ?? null;

    const components: SitComponent[] = [
      {
        label: "Season vs " + (pitcherHand ?? "?") + "HP",
        ops: splitVsPitcherHand?.OPS ?? null,
        pa: splitVsPitcherHand?.PA ?? 0,
        qualityScore: toQualityScore(splitVsPitcherHand?.OPS ?? null),
        baseWeight: BASE_WEIGHTS.seasonBatter,
        confidence: confidence(splitVsPitcherHand?.PA, PA_THRESHOLDS.seasonBatter),
        effectiveWeight: 0,
      },
      {
        label: "SP quality allowed",
        ops: pitcherSplitVsBatterSide?.OPS ?? null,
        pa: pitcherSplitVsBatterSide?.PA ?? 0,
        qualityScore: toQualityScore(pitcherSplitVsBatterSide?.OPS ?? null),
        baseWeight: BASE_WEIGHTS.pitcherQuality,
        confidence: confidence(pitcherSplitVsBatterSide?.PA, PA_THRESHOLDS.pitcherQuality),
        effectiveWeight: 0,
      },
      {
        label: "Last 30 days",
        ops: batterForm30?.OPS ?? null,
        pa: batterForm30?.PA ?? 0,
        qualityScore: toQualityScore(batterForm30?.OPS ?? null),
        baseWeight: BASE_WEIGHTS.form30,
        confidence: confidence(batterForm30?.PA, PA_THRESHOLDS.form30),
        effectiveWeight: 0,
      },
      {
        label: "Last 10 days",
        ops: batterForm10?.OPS ?? null,
        pa: batterForm10?.PA ?? 0,
        qualityScore: toQualityScore(batterForm10?.OPS ?? null),
        baseWeight: BASE_WEIGHTS.form10,
        confidence: confidence(batterForm10?.PA, PA_THRESHOLDS.form10),
        effectiveWeight: 0,
      },
    ];

    // Effective weight = base weight * confidence, for components with a real quality score.
    for (const c of components) {
      c.effectiveWeight = c.qualityScore != null ? c.baseWeight * c.confidence : 0;
    }
    const totalWeight = components.reduce((sum, c) => sum + c.effectiveWeight, 0);

    let sitScore: number | null = null;
    if (totalWeight > 0) {
      const qualitySum = components.reduce(
        (sum, c) => sum + (c.qualityScore ?? 0) * c.effectiveWeight,
        0
      );
      const blendedQuality = qualitySum / totalWeight;
      sitScore = Math.round(100 - blendedQuality);
      // Renormalize effectiveWeight to sum to 1 for clean display of each
      // component's actual contribution share.
      for (const c of components) c.effectiveWeight = c.effectiveWeight / totalWeight;
    }

    let note = "No game today.";
    if (!matchup) {
      note = "Off day — not in today's schedule.";
    } else if (!opponentPitcher) {
      note = "Opponent starter not yet announced.";
    } else if (!pitcherHand) {
      note = `Facing ${opponentPitcher.fullName} — throwing hand not confirmed.`;
    } else {
      note = `Faces ${opponentPitcher.fullName} (${pitcherHand}HP)${
        effectiveBatSide === player.bats ? "" : ` — switch, batting ${effectiveBatSide}`
      }`;
    }

    return {
      player,
      opponentPitcher,
      splitVsPitcherHand,
      splitVsOppositeHand,
      form30: batterForm30,
      form10: batterForm10,
      pitcherSplitVsBatterSide,
      sitScore,
      sitBreakdown: components,
      note,
    };
  });
}

/** Sort ascending SIT (lowest/best matchup first) for the default list order. */
export function sitSortKey(rec: LineupRecommendation): number {
  return rec.sitScore ?? 50; // unknowns sort to the middle, not top or bottom
}
