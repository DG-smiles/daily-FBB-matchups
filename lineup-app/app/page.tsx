"use client";

import { useEffect, useState } from "react";
import { buildRecommendations, sitSortKey } from "@/lib/recommend";
import { resolveOpponent, ResolvedPlayerStatus } from "@/lib/mlb";
import { assignLineup, LineupAssignmentResult } from "@/lib/assignLineup";
import { LineupDecisionView, ExcludedPlayer } from "@/components/LineupDecisionView";
import { RosterManager } from "@/components/RosterManager";
import { RosterSummary } from "@/lib/rosters";
import { LineupRecommendation, Player, ScheduleGame, SplitLine } from "@/lib/types";

const USER_ID_STORAGE = "lineupUserId";

function todayISO(): string {
  // Use local date components, not toISOString() (which is UTC and can
  // roll over to "tomorrow" for anyone west of UTC in the evening).
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type ViewState = "loading" | "picker" | "ready";

export default function Page() {
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [rosterList, setRosterList] = useState<RosterSummary[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [roster, setRoster] = useState<Player[] | null>(null);
  const [showManager, setShowManager] = useState(false);

  const [date, setDate] = useState(todayISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recs, setRecs] = useState<LineupRecommendation[] | null>(null);
  const [splitErrors, setSplitErrors] = useState<Record<string, string> | null>(null);
  const [lineup, setLineup] = useState<LineupAssignmentResult | null>(null);
  const [excluded, setExcluded] = useState<ExcludedPlayer[]>([]);

  // Rosters aren't secret — this is just "which roster is mine," not a login.
  // Pick once, remembered in localStorage on this device from then on. See
  // README "Rosters" for how a friend's name gets added to lib/rosters.json.
  async function selectRoster(id: string, list: RosterSummary[]) {
    const res = await fetch(`/api/roster?user=${encodeURIComponent(id)}`);
    if (!res.ok) {
      window.localStorage.removeItem(USER_ID_STORAGE);
      setViewState("picker");
      return;
    }
    const json = await res.json();
    const summary = list.find((r) => r.id === id);
    window.localStorage.setItem(USER_ID_STORAGE, id);
    setUserId(id);
    setDisplayName(summary?.displayName ?? id);
    setRoster(json.roster as Player[]);
    setViewState("ready");
  }

  function switchRoster() {
    window.localStorage.removeItem(USER_ID_STORAGE);
    setUserId(null);
    setDisplayName(null);
    setRoster(null);
    setShowManager(false);
    setRecs(null);
    setLineup(null);
    setExcluded([]);
    setSplitErrors(null);
    setError(null);
    setViewState("picker");
  }

  useEffect(() => {
    fetch("/api/rosters")
      .then((res) => res.json())
      .then(async (json) => {
        const list: RosterSummary[] = json.rosters ?? [];
        setRosterList(list);

        const storedId = window.localStorage.getItem(USER_ID_STORAGE);
        if (storedId && list.some((r) => r.id === storedId)) {
          await selectRoster(storedId, list);
        } else {
          setViewState("picker");
        }
      })
      .catch(() => setViewState("picker"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pullLineup() {
    if (!roster || !userId) return;
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
      // hand-editing lib/rosters.json.
      const [scheduleRes, statusRes] = await Promise.all([
        fetch(`/api/schedule?date=${date}`),
        fetch(`/api/roster-status?user=${encodeURIComponent(userId)}`),
      ]);

      const scheduleJson = await scheduleRes.json();
      if (!scheduleRes.ok) throw new Error(scheduleJson.error ?? "Schedule fetch failed");
      const games: ScheduleGame[] = scheduleJson.games;

      const statusJson = await statusRes.json();
      if (!statusRes.ok) throw new Error(statusJson.error ?? "Roster status fetch failed");
      const statuses: Record<number, ResolvedPlayerStatus> = statusJson.statuses;

      // Freshly-resolved status is now the source of truth for who's active
      // today — the hardcoded `status` field in lib/rosters.json is only a
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

  function handleRosterChange(updated: Player[]) {
    setRoster(updated);
    // A roster edit can resolve (or change) whatever the last pull attempt
    // ran into — don't leave a stale error/lineup sitting on screen after
    // the thing that caused it just changed.
    setError(null);
    setRecs(null);
    setLineup(null);
    setExcluded([]);
    setSplitErrors(null);
  }

  if (viewState === "loading") {
    return <div className="wrap" />;
  }

  if (viewState === "picker") {
    return (
      <div className="wrap">
        <h1>Daily Lineup Analysis</h1>
        <div className="card">
          <div className="card-head">
            <div className="player-name">Who&apos;s this?</div>
          </div>
          <div className="roster-picker-list">
            {rosterList.map((r) => (
              <button
                key={r.id}
                className="roster-picker-button"
                onClick={() => selectRoster(r.id, rosterList)}
              >
                {r.displayName}
              </button>
            ))}
          </div>
          {rosterList.length === 0 && (
            <div className="note">
              No rosters configured yet — add one in lib/rosters.json (see README).
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <h1>Daily Lineup Analysis</h1>

      <div className="identity-line">
        {displayName}
        {" · "}
        <button className="switch-link" onClick={switchRoster}>
          Not you? Switch
        </button>
      </div>

      <div className="manage-roster-row">
        <button className="secondary" onClick={() => setShowManager((v) => !v)}>
          {showManager ? "Hide roster management" : "Manage roster"}
        </button>
      </div>

      {showManager && roster && (
        <RosterManager userId={userId!} roster={roster} onRosterChange={handleRosterChange} />
      )}

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
