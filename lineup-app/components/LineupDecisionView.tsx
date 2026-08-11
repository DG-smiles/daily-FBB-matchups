import { LineupAssignmentResult, SlotAssignment } from "@/lib/assignLineup";
import { sitTagClass } from "@/lib/recommend";
import { LineupRecommendation, Player } from "@/lib/types";

export interface ExcludedPlayer {
  player: Player;
  reason: "IL" | "NA";
  statusDescription: string;
}

interface LineupDecisionViewProps {
  assignment: LineupAssignmentResult;
  excluded: ExcludedPlayer[];
}

/**
 * The "what do I actually do today" view. Two ordering choices are
 * deliberate, not incidental:
 *  - Bench renders FIRST, worst SIT score first — clear the obvious sits
 *    fast, then work down toward the active lineup's closer calls.
 *  - Every row (bench or active) is a <details> that expands in place to
 *    the exact same note + breakdown a card in the old standalone data grid
 *    showed — same data, same classes/look, just reachable per-row instead
 *    of behind one big separate section.
 */
export function LineupDecisionView({ assignment, excluded }: LineupDecisionViewProps) {
  const { slots, bench, warning } = assignment;

  return (
    <>
      {warning && (
        <div className="warning-banner">
          <strong>Highest SIT score of the day is starting.</strong>{" "}
          {warning.rec.player.name} ({warning.rec.sitScore}) has today&apos;s worst matchup and
          is your only eligible {warning.slot.label} today — worth a look at the wire.
        </div>
      )}

      {bench.length > 0 && (
        <div className="decision-panel">
          <div className="decision-section-title">Bench ({bench.length})</div>
          <div className="decision-section-subtitle">Worst matchup first</div>
          {bench.map((rec) => (
            <RecRow key={rec.player.id} rec={rec} leftLabel="" />
          ))}
        </div>
      )}

      <div className="decision-panel">
        <div className="decision-section-title">Today&apos;s lineup</div>
        {slots.map((s) => (
          <SlotRow key={s.slot.id} assignment={s} />
        ))}
      </div>

      {excluded.length > 0 && (
        <div className="decision-panel">
          <div className="decision-section-title">Excluded today</div>
          {excluded.map(({ player, reason, statusDescription }) => (
            <div className="excluded-row" key={player.id}>
              <span>{player.name}</span>
              <span
                className={`excluded-badge ${reason === "IL" ? "il" : ""}`}
                title={statusDescription}
              >
                {reason}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SlotRow({ assignment }: { assignment: SlotAssignment }) {
  const { slot, rec, unfillable } = assignment;
  if (unfillable || !rec) {
    return (
      <div className="rec-row rec-row-empty">
        <span className="rec-row-slot">{slot.label}</span>
        <span className="slot-empty">No eligible player today</span>
      </div>
    );
  }
  return <RecRow rec={rec} leftLabel={slot.label} />;
}

/**
 * One row, collapsed or expanded. Collapsed = name, matchup note, SIT chip
 * (everything you need for the start/sit call itself). Expanded = the same
 * roster meta + full weighted breakdown the old RecCard showed, verbatim.
 */
function RecRow({ rec, leftLabel }: { rec: LineupRecommendation; leftLabel: string }) {
  return (
    <details className="rec-row">
      <summary className="rec-row-summary">
        <span className="rec-row-slot">{leftLabel}</span>
        <div className="rec-row-main">
          <div className="rec-row-name">{rec.player.name}</div>
          <div className="rec-row-note">{rec.note}</div>
        </div>
        {rec.sitScore != null && (
          <span className={`ops-tag ${sitTagClass(rec.sitScore)}`}>SIT: {rec.sitScore}</span>
        )}
        <span className="rec-row-chevron">›</span>
      </summary>

      <div className="rec-row-detail">
        <div className="player-meta">
          {rec.player.mlbTeamAbbrev} · {rec.player.eligiblePositions.join("/")} · bats{" "}
          {rec.player.bats}
        </div>

        <div className="breakdown">
          {rec.sitBreakdown.map((c) => (
            <div className="breakdown-row" key={c.label}>
              <span className="breakdown-label">{c.label}</span>
              <span className="breakdown-value">
                {c.ops != null ? c.ops.toFixed(3) + " OPS" : "no data"}
                {c.pa > 0 && <span className="breakdown-pa"> ({c.pa} PA)</span>}
              </span>
              <span className="breakdown-weight">{Math.round(c.effectiveWeight * 100)}% wt</span>
            </div>
          ))}
          {(rec.sbBonus.sb > 0 || rec.sbBonus.cs > 0) && (
            <div className="breakdown-row">
              <span className="breakdown-label">SB Bonus (30d)</span>
              <span className="breakdown-value">
                {rec.sbBonus.sb} SB, {rec.sbBonus.cs} CS
              </span>
              <span className="breakdown-weight">-{rec.sbBonus.pointsOff} SIT</span>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
