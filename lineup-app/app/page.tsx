"use client";

import { useState } from "react";
import { defaultRoster } from "@/lib/defaultRoster";
import { buildRecommendations, recommendationScore } from "@/lib/recommend";
import { LineupRecommendation, ScheduleGame, SplitLine } from "@/lib/types";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Page() {
  const [date, setDate] = useState(todayISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recs, setRecs] = useState<LineupRecommendation[] | null>(null);

  async function pullLineup() {
    setLoading(true);
    setError(null);
    setRecs(null);
    try {
      const season = new Date(date).getFullYear();

      // Call 1: schedule + probable pitchers for every team playing today.
      const scheduleRes = await fetch(`/api/schedule?date=${date}`);
      const scheduleJson = await scheduleRes.json();
      if (!scheduleRes.ok) throw new Error(scheduleJson.error ?? "Schedule fetch failed");
      const games: ScheduleGame[] = scheduleJson.games;

      // Call 2: batch splits (vs L, vs R, trailing 30 days) for the whole roster at once.
      const fangraphsIds = defaultRoster
        .filter((p) => p.status !== "IL" && p.status !== "NA")
        .map((p) => p.fangraphsId);

      const splitsRes = await fetch("/api/splits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fangraphsIds, season, dateISO: date }),
      });
      const splitsJson = await splitsRes.json();
      if (!splitsRes.ok) throw new Error(splitsJson.error ?? "Splits fetch failed");

      const vsL: Record<number, SplitLine> = splitsJson.vsL;
      const vsR: Record<number, SplitLine> = splitsJson.vsR;
      const recent: Record<number, SplitLine> = splitsJson.recent;

      const built = buildRecommendations(defaultRoster, games, vsL, vsR, recent);
      built.sort((a, b) => recommendationScore(b) - recommendationScore(a));
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
      <h1>Daily Lineup Pull</h1>
      <p className="sub">
        One click: today&apos;s probable pitchers (MLB Stats API) + season platoon splits and
        trailing-30-day form for every active hitter (FanGraphs), fetched server-side.
      </p>

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
          If this is a FanGraphs 500/403, see the README troubleshooting section — their API
          sometimes needs a session cookie added to lib/fangraphs.ts.
        </div>
      )}

      {recs && (
        <div className="status-line">
          {recs.length} active hitters · pulled {new Date().toLocaleTimeString()}
        </div>
      )}

      {recs?.map((rec) => (
        <RecCard key={rec.player.id} rec={rec} />
      ))}
    </div>
  );
}

function RecCard({ rec }: { rec: LineupRecommendation }) {
  const ops = rec.splitVsPitcherHand?.OPS;
  const tagClass = ops == null ? "" : ops >= 0.75 ? "good" : ops < 0.65 ? "bad" : "";

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="player-name">{rec.player.name}</div>
          <div className="player-meta">
            {rec.player.mlbTeamAbbrev} · {rec.player.eligiblePositions.join("/")} · bats {rec.player.bats}
          </div>
        </div>
        {ops != null && (
          <div className={`ops-tag ${tagClass}`}>{ops.toFixed(3)} OPS</div>
        )}
      </div>
      <div className="note">{rec.note}</div>
    </div>
  );
}
