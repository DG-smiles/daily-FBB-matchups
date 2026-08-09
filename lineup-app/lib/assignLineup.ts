import { LineupRecommendation } from "./types";

/**
 * Fills all 13 active roster slots from today's ranked recommendations,
 * minimizing total SIT score across the filled slots, guaranteeing every
 * slot gets filled whenever a valid complete assignment exists.
 *
 * WHY A REAL ASSIGNMENT ALGORITHM INSTEAD OF GREEDY SORTING:
 * "Take the sorted list, assign each player to any open eligible slot" can
 * paint itself into a corner — if a position's only eligible players get
 * greedily grabbed by flex slots (CI/MI/OF/UTIL) before the position-specific
 * slot is considered, that slot ends up unfillable even though a valid
 * complete assignment existed. This uses the Hungarian algorithm (min-cost
 * bipartite matching) instead, which finds the lowest-total-SIT complete
 * assignment across all 13 slots at once.
 *
 * Deliberately does NOT weight or bias scores by position scarcity — every
 * slot's cost is just the player's SIT score. Scarcity only affects *which*
 * player has to fill *which* slot, which the matching algorithm resolves as
 * a byproduct of guaranteeing a complete, optimal fill.
 */

export type SlotId =
  | "C"
  | "1B"
  | "2B"
  | "3B"
  | "SS"
  | "CI"
  | "MI"
  | "LF"
  | "CF"
  | "RF"
  | "OF1"
  | "OF2"
  | "UTIL";

// Display order matches the roster-spots table in daily-lineup-analysis.md.
export const SLOT_ORDER: SlotId[] = [
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "CI",
  "MI",
  "LF",
  "CF",
  "RF",
  "OF1",
  "OF2",
  "UTIL",
];

export const SLOT_LABELS: Record<SlotId, string> = {
  C: "C",
  "1B": "1B",
  "2B": "2B",
  "3B": "3B",
  SS: "SS",
  CI: "CI",
  MI: "MI",
  LF: "LF",
  CF: "CF",
  RF: "RF",
  OF1: "OF",
  OF2: "OF",
  UTIL: "UTIL",
};

const SLOT_ELIGIBILITY: Record<SlotId, (eligiblePositions: string[]) => boolean> = {
  C: (p) => p.includes("C"),
  "1B": (p) => p.includes("1B"),
  "2B": (p) => p.includes("2B"),
  "3B": (p) => p.includes("3B"),
  SS: (p) => p.includes("SS"),
  CI: (p) => p.includes("1B") || p.includes("3B"),
  MI: (p) => p.includes("2B") || p.includes("SS"),
  LF: (p) => p.includes("LF"),
  CF: (p) => p.includes("CF"),
  RF: (p) => p.includes("RF"),
  OF1: (p) => p.includes("LF") || p.includes("CF") || p.includes("RF"),
  OF2: (p) => p.includes("LF") || p.includes("CF") || p.includes("RF"),
  UTIL: () => true,
};

export interface SlotAssignment {
  slot: SlotId;
  rec: LineupRecommendation | null;
  /** true if no eligible, scoreable player existed for this slot at all. */
  unfillable: boolean;
}

export interface LineupWarning {
  rec: LineupRecommendation;
  slot: SlotId;
}

export interface LineupAssignmentResult {
  slots: SlotAssignment[];
  bench: LineupRecommendation[];
  /** Non-null when today's single highest SIT score in the whole eligible
   * pool ended up starting anyway, because no better option existed for
   * their slot. */
  warning: LineupWarning | null;
}

// Cost sentinel for a real player who isn't eligible for a given slot.
const INELIGIBLE_COST = 1_000_000;
// Cost sentinel for a phantom placeholder (used only when there are fewer
// scoreable candidates than slots) — always worse than a real ineligible
// pairing so it's never preferred, and always distinguishable afterward.
const PHANTOM_COST = 10_000_000;

/**
 * Hungarian algorithm (Kuhn–Munkres, O(n^2 * m)) for rectangular cost
 * matrices where n <= m: assigns each of n rows to a distinct column,
 * minimizing total cost. 1-indexed internally per the standard formulation.
 * Returns, for each row (0-indexed), the assigned column index (0-indexed).
 */
function hungarianAssignment(cost: number[][]): number[] {
  const n = cost.length; // rows (slots)
  const m = cost[0].length; // columns (candidates), m >= n

  const u = new Array(n + 1).fill(0);
  const v = new Array(m + 1).fill(0);
  const p = new Array(m + 1).fill(0); // p[j] = row assigned to column j
  const way = new Array(m + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(Infinity);
    const used = new Array(m + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = -1;
      for (let j = 1; j <= m; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    while (j0) {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    }
  }

  const rowToCol = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) {
    if (p[j] !== 0) rowToCol[p[j] - 1] = j - 1;
  }
  return rowToCol;
}

/**
 * Fills all 13 active slots from today's recommendations. Recs with no
 * sitScore (off day, or missing data) can't meaningfully start and are
 * treated as bench-only, same as if they were ineligible for every slot.
 */
export function assignLineup(recs: LineupRecommendation[]): LineupAssignmentResult {
  const candidates = recs.filter((r) => r.sitScore != null);
  const scorelessBench = recs.filter((r) => r.sitScore == null);

  const n = SLOT_ORDER.length; // 13
  // Pad with phantom placeholders if there aren't enough real, scoreable
  // candidates to fill every slot, so the matching algorithm always has
  // enough columns to run. Phantoms are ineligible for every slot (including
  // UTIL) and surface as "unfillable" rather than silently standing in.
  const padCount = Math.max(0, n - candidates.length);
  const pool: (LineupRecommendation | null)[] = [
    ...candidates,
    ...(Array(padCount).fill(null) as null[]),
  ];

  const cost: number[][] = SLOT_ORDER.map((slot) =>
    pool.map((rec) => {
      if (rec == null) return PHANTOM_COST;
      return SLOT_ELIGIBILITY[slot](rec.player.eligiblePositions)
        ? (rec.sitScore as number)
        : INELIGIBLE_COST;
    })
  );

  const rowToCol = hungarianAssignment(cost);

  const assignedIdx = new Set<number>();
  const slots: SlotAssignment[] = SLOT_ORDER.map((slot, i) => {
    const col = rowToCol[i];
    const rec = col >= 0 ? pool[col] : null;
    const unfillable = !rec || cost[i][col] >= INELIGIBLE_COST;
    if (rec && !unfillable) assignedIdx.add(col);
    return { slot, rec: unfillable ? null : rec, unfillable };
  });

  const benchFromCandidates = candidates.filter((_, idx) => !assignedIdx.has(idx));
  const bench = [...benchFromCandidates, ...scorelessBench].sort(
    (a, b) => (a.sitScore ?? 50) - (b.sitScore ?? 50)
  );

  // "Absolute highest SIT score of the day" is measured against the whole
  // scoreable pool (not just starters), per spec.
  let warning: LineupWarning | null = null;
  if (candidates.length > 0) {
    const maxSitScore = Math.max(...candidates.map((r) => r.sitScore as number));
    for (const s of slots) {
      if (s.rec && s.rec.sitScore === maxSitScore) {
        warning = { rec: s.rec, slot: s.slot };
        break;
      }
    }
  }

  return { slots, bench, warning };
}
