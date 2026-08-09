"use client";

import { useState } from "react";
import { defaultRoster } from "@/lib/defaultRoster";
import { buildRecommendations, sitSortKey } from "@/lib/recommend";
import { resolveOpponent } from "@/lib/mlb";
import { LineupRecommendation, ScheduleGame, SplitLine } from "@/lib/types";

function todayISO(): string {
  // Use local date components, not toISOString() (which is UTC and can
  // roll over to "tomorrow" for anyone west of UTC in the evening).
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function Page() {
  const [date, setDate] = useState(todayISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recs, setRecs] = useState<LineupRecommendation[] | null>(null);
  const [splitErrors, setSplitErrors] = useState<Record<string, string> | null>(null);

  async function pullLineup() {
    setLoading(true);
    setError(null);
    setRecs(null);
    setSplitErrors(null);
    try {
      const season = new Date(date).getFullYear();

      // Call 1: schedule + probable pitchers for every team playing today.
      const scheduleRes = await fetch(`/api/schedule?date=${date}`);
      const scheduleJson = await scheduleRes.json();
      if (!scheduleRes.ok) throw new Error(scheduleJson.error ?? "Schedule fetch failed");
      const games: ScheduleGame[] = scheduleJson.games;

      const activeRoster = defaultRoster.filter((p) => p.status !== "IL" && p.status !== "NA");
      const mlbamIds = activeRoster.map((p) => p.mlbamId);

      // Resolve each hitter's opponent pitcher up front so we know which
      // (unique) pitchers to pull quality splits for — shared starters
      // (e.g. two hitters facing the same SP) only get fetched once.
      const pitcherIdSet = new Set<number>();
      for (const p of activeRoster) {
        const matchup = resolveOpponent(games, p.mlbTeamId);
        if (matchup?.opponentPitcher) pitcherIdSet.add(matchup.opponentPitcher.id);
      }

      // Call 2: MLB stats — per hitter (season split + 30d form + 10d form)
      // and per unique opposing pitcher (season split allowed), all parallel.
      const splitsRes = await fetch("/api/splits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mlbamIds,
          pitcherMlbamIds: Array.from(pitcherIdSet),
          season,
          dateISO: date,
        }),
      });
      const splitsJson = await splitsRes.json();
      if (!splitsRes.ok) throw new Error(splitsJson.error ?? "Splits fetch failed");

      const vsL: Record<number, SplitLine> = splitsJson.vsL;
      const vsR: Record<number, SplitLine> = splitsJson.vsR;
      const form30: Record<number, SplitLine> = splitsJson.form30;
      const form10: Record<number, SplitLine> = splitsJson.form10;
      const pitcherVsL: Record<number, SplitLine> = splitsJson.pitcherVsL;
      const pitcherVsR: Record<number, SplitLine> = splitsJson.pitcherVsR;
      if (splitsJson.errors && Object.keys(splitsJson.errors).length > 0) {
        setSplitErrors(splitsJson.errors);
      }

      const built = buildRecommendations(
        defaultRoster,
        games,
        vsL,
        vsR,
        form30,
        form10,
        pitcherVsL,
        pitcherVsR
      );
      built.sort((a, b) => sitSortKey(a) - sitSortKey(b));
      setRecs(built);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wrap">
      <div className="eyebrow">Men of Girth</div>
      <h1>Daily Lineup Analysis</h1>

      <div className="controls">
        <input
          className="date-input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button onClick={pullLineup} disabled={loading}>
          {loading ? "Pulling…" : "Pull today's lineup"}
        </button>
      </div>

      {error && (
        <div className="error-box">
          {error}
          <br />
          If this is on the recent-form or pitcher-splits call, those weren&apos;t verified live
          against real output — see README troubleshooting / /api/debug-mlb.
        </div>
      )}

      <div className="status-line">
        <div>Source: MLB Stats API</div>
        {recs && (
          <div>
            {recs.length} batters analyzed @{" "}
            {new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </div>
        )}
        <div>SIT: 0 = start, 100 = bench</div>
      </div>

      {splitErrors && (
        <div className="error-box">
          Splits failed for: {Object.keys(splitErrors).join(", ")}
          <br />
          Check /api/debug-mlb?player=&lt;mlbamId&gt;&amp;type=recent (or splits) to see the raw
          MLB API response.
        </div>
      )}

      {recs?.map((rec) => (
        <RecCard key={rec.player.id} rec={rec} />
      ))}
    </div>
  );
}

function sitTagClass(sit: number | null): string {
  if (sit == null) return "";
  if (sit <= 35) return "good"; // low SIT = good matchup = green
  if (sit >= 65) return "bad";
  return "";
}

function RecCard({ rec }: { rec: LineupRecommendation }) {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="player-name">{rec.player.name}</div>
          <div className="player-meta">
            {rec.player.mlbTeamAbbrev} · {rec.player.eligiblePositions.join("/")} · bats{" "}
            {rec.player.bats}
          </div>
        </div>
        {rec.sitScore != null && (
          <div className={`ops-tag ${sitTagClass(rec.sitScore)}`}>SIT: {rec.sitScore}</div>
        )}
      </div>

      <div className="note">{rec.note}</div>

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
  );
}
