"use client";

import { useEffect, useState } from "react";
import { buildRecommendations, sitSortKey } from "@/lib/recommend";
import { resolveOpponent, ResolvedPlayerStatus } from "@/lib/mlb";
import { assignLineup, LineupAssignmentResult } from "@/lib/assignLineup";
import { LineupDecisionView, ExcludedPlayer } from "@/components/LineupDecisionView";
import { LineupRecommendation, Player, ScheduleGame, SplitLine } from "@/lib/types";

const OWNER_KEY_STORAGE = "lineupOwnerKey";

function todayISO(): string {
  // Use local date components, not toISOString() (which is UTC and can
  // roll over to "tomorrow" for anyone west of UTC in the evening).
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type AuthState = "checking" | "locked" | "unlocked";

export default function Page() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [ownerKey, setOwnerKey] = useState<string | null>(null);
  const [roster, setRoster] = useState<Player[] | null>(null);

  const [date, setDate] = useState(todayISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recs, setRecs] = useState<LineupRecommendation[] | null>(null);
  const [splitErrors, setSplitErrors] = useState<Record<string, string> | null>(null);
  const [lineup, setLineup] = useState<LineupAssignmentResult | null>(null);
  const [excluded, setExcluded] = useState<ExcludedPlayer[]>([]);

  // One-time device unlock: a link visited once as ?key=<OWNER_ACCESS_KEY>
  // gets that key stashed in localStorage, then this device never needs the
  // link again. Without a valid key, the roster is never fetched — it's
  // gated server-side in /api/roster, not just hidden in this UI. See
  // lib/auth.ts for the server-side check and setup instructions.
  useEffect(() => {
    const url = new URL(window.location.href);
    const urlKey = url.searchParams.get("key");
    const key = urlKey || window.localStorage.getItem(OWNER_KEY_STORAGE);

    if (urlKey) {
      window.localStorage.setItem(OWNER_KEY_STORAGE, urlKey);
      url.searchParams.delete("key");
      window.history.replaceState({}, "", url.toString());
    }

    if (!key) {
      setAuthState("locked");
      return;
    }

    fetch("/api/roster", { headers: { "x-owner-key": key } })
      .then(async (res) => {
        if (!res.ok) {
          window.localStorage.removeItem(OWNER_KEY_STORAGE);
          setAuthState("locked");
          return;
        }
        const json = await res.json();
        setOwnerKey(key);
        setRoster(json.roster as Player[]);
        setAuthState("unlocked");
      })
      .catch(() => setAuthState("locked"));
  }, []);

  async function pullLineup() {
    if (!roster || !ownerKey) return;
    setLoading(true);
    setError(null);
    setRecs(null);
    setSplitErrors(null);
    setLineup(null);
    setExcluded([]);
    try {
      const season = new Date(date).getFullYear();

      // Call 1a + 1b, in parallel: today's schedule, and fresh active/IL/NA
      // status for every rostered player — this is what catches a same-day
      // IL move or activation (e.g. Buxton coming off IL) without anyone
      // hand-editing defaultRoster.ts.
      const [scheduleRes, statusRes] = await Promise.all([
        fetch(`/api/schedule?date=${date}`),
        fetch(`/api/roster-status`, { headers: { "x-owner-key": ownerKey } }),
      ]);

      const scheduleJson = await scheduleRes.json();
      if (!scheduleRes.ok) throw new Error(scheduleJson.error ?? "Schedule fetch failed");
      const games: ScheduleGame[] = scheduleJson.games;

      const statusJson = await statusRes.json();
      if (!statusRes.ok) throw new Error(statusJson.error ?? "Roster status fetch failed");
      const statuses: Record<number, ResolvedPlayerStatus> = statusJson.statuses;

      // Freshly-resolved status is now the source of truth for who's active
      // today — the hardcoded `status` field in defaultRoster.ts is only a
      // same-day-offline fallback (used if a player's mlbamId is unverified
      // and couldn't be looked up).
      const resolvedRoster: Player[] = roster.map((p) => ({
        ...p,
        status: statuses[p.mlbamId]?.status ?? p.status,
      }));

      setExcluded(
        resolvedRoster
          .filter((p) => p.status === "IL" || p.status === "NA")
          .map((p) => ({
            player: p,
            reason: p.status as "IL" | "NA",
            statusDescription:
              statuses[p.mlbamId]?.statusDescription ?? "Not on active MLB roster",
          }))
      );

      const activeRoster = resolvedRoster.filter((p) => p.status !== "IL" && p.status !== "NA");
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
        resolvedRoster,
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
      setLineup(assignLineup(built));
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (authState === "checking") {
    return <div className="wrap" />;
  }

  if (authState === "locked") {
    return (
      <div className="wrap">
        <h1>Daily Lineup Analysis</h1>
        <div className="card">
          <div className="note">
            This device isn&apos;t linked to a roster yet. Open the link that was shared with
            you to connect one.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
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

      {lineup && <LineupDecisionView assignment={lineup} excluded={excluded} />}
    </div>
  );
}
