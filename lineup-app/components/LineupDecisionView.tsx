import { LineupAssignmentResult, SLOT_LABELS } from "@/lib/assignLineup";
import { sitTagClass } from "@/lib/recommend";
import { Player } from "@/lib/types";

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
 * The "what do I actually do today" view — sits above the existing detailed
 * SIT-breakdown grid (unchanged, now tucked behind an expand toggle in
 * page.tsx). This component only renders the decision: who starts where,
 * who's benched, who was excluded and why, and a warning if today's single
 * worst SIT score in the pool got force-started anyway.
 */
export function LineupDecisionView({ assignment, excluded }: LineupDecisionViewProps) {
  const { slots, bench, warning } = assignment;

  return (
    <>
      {warning && (
        <div className="warning-banner">
          <strong>Highest SIT score of the day is starting.</strong>{" "}
          {warning.rec.player.name} ({warning.rec.sitScore}) has today&apos;s worst matchup and
          is your only eligible {SLOT_LABELS[warning.slot]} today — worth a look at the wire.
        </div>
      )}

      <div className="decision-panel">
        <div className="decision-section-title">Today&apos;s lineup</div>
        {slots.map((s) => (
          <div className="slot-row" key={s.slot}>
            <span className="slot-label">{SLOT_LABELS[s.slot]}</span>
            {s.rec ? (
              <>
                <div className="slot-player">
                  <div className="slot-player-name">{s.rec.player.name}</div>
                  <div className="slot-player-meta">
                    {s.rec.opponentPitcher
                      ? `vs ${s.rec.opponentPitcher.fullName}${
                          s.rec.opponentPitcher.throws ? ` (${s.rec.opponentPitcher.throws}HP)` : ""
                        }`
                      : "no probable SP yet"}
                  </div>
                </div>
                <span className={`ops-tag ${sitTagClass(s.rec.sitScore)}`}>
                  SIT: {s.rec.sitScore}
                </span>
              </>
            ) : (
              <span className="slot-empty">No eligible player today</span>
            )}
          </div>
        ))}

        {bench.length > 0 && (
          <details className="bench-toggle">
            <summary>Bench ({bench.length})</summary>
            {bench.map((rec) => (
              <div className="bench-row" key={rec.player.id}>
                <span>{rec.player.name}</span>
                {rec.sitScore != null ? (
                  <span className={`ops-tag ${sitTagClass(rec.sitScore)}`}>
                    SIT: {rec.sitScore}
                  </span>
                ) : (
                  <span className="slot-empty">no score today</span>
                )}
              </div>
            ))}
          </details>
        )}
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
