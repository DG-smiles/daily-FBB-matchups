"use client";

import { useEffect, useMemo, useState } from "react";
import { Player, UniversePlayer } from "@/lib/types";

interface RosterManagerProps {
  userId: string;
  roster: Player[];
  onRosterChange: (players: Player[]) => void;
}

const MAX_RESULTS = 6;

export function RosterManager({ userId, roster, onRosterChange }: RosterManagerProps) {
  const [universe, setUniverse] = useState<UniversePlayer[] | null>(null);
  const [universeError, setUniverseError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<number | string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Lazy-loaded: only fetched once this panel is actually open, since it's
  // the full MLB hitter pool (roughly a thousand-plus players).
  useEffect(() => {
    fetch(`/api/players?season=${new Date().getFullYear()}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.error) {
          setUniverseError(json.error);
        } else {
          setUniverse(json.players as UniversePlayer[]);
        }
      })
      .catch(() => setUniverseError("Couldn't load the player pool."));
  }, []);

  const rosteredIds = useMemo(() => new Set(roster.map((p) => p.mlbamId)), [roster]);

  const results = useMemo(() => {
    if (!universe || query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    return universe
      .filter((p) => !rosteredIds.has(p.mlbamId))
      .filter((p) => p.name.toLowerCase().includes(q) || p.mlbTeamAbbrev.toLowerCase() === q)
      .slice(0, MAX_RESULTS);
  }, [universe, query, rosteredIds]);

  async function handleAdd(mlbamId: number) {
    setActionError(null);
    setPendingId(mlbamId);
    try {
      const res = await fetch("/api/roster/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, mlbamId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Add failed");
      onRosterChange(json.roster as Player[]);
      setQuery("");
    } catch (e: any) {
      setActionError(e.message ?? "Add failed");
    } finally {
      setPendingId(null);
    }
  }

  async function handleDrop(playerId: string, playerName: string) {
    if (!window.confirm(`Drop ${playerName}?`)) return;
    setActionError(null);
    setPendingId(playerId);
    try {
      const res = await fetch("/api/roster/drop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, playerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Drop failed");
      onRosterChange(json.roster as Player[]);
    } catch (e: any) {
      setActionError(e.message ?? "Drop failed");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="decision-panel">
      <div className="decision-section-title">Your roster ({roster.length})</div>
      <div className="roster-manage-list">
        {roster.map((p) => (
          <div className="roster-manage-row" key={p.id}>
            <div>
              <div className="slot-player-name">{p.name}</div>
              <div className="rec-row-note">
                {p.mlbTeamAbbrev} · {p.eligiblePositions.join("/")}
              </div>
            </div>
            <button
              className="roster-drop-button"
              onClick={() => handleDrop(p.id, p.name)}
              disabled={pendingId === p.id}
            >
              {pendingId === p.id ? "…" : "Drop"}
            </button>
          </div>
        ))}
      </div>

      <div className="decision-section-title roster-add-title">Add a player</div>
      <input
        className="roster-search-input"
        type="text"
        placeholder="Search by name or team…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {universeError && <div className="note">{universeError}</div>}
      {!universe && !universeError && <div className="note">Loading player pool…</div>}

      {actionError && <div className="note roster-error">{actionError}</div>}

      {query.trim().length >= 2 && universe && (
        <div className="roster-manage-list">
          {results.length === 0 && <div className="note">No matches.</div>}
          {results.map((p) => (
            <div className="roster-manage-row" key={p.mlbamId}>
              <div>
                <div className="slot-player-name">{p.name}</div>
                <div className="rec-row-note">
                  {p.mlbTeamAbbrev} · {p.position}
                  {p.bats ? ` · bats ${p.bats}` : ""}
                </div>
              </div>
              <button
                className="roster-picker-button"
                onClick={() => handleAdd(p.mlbamId)}
                disabled={pendingId === p.mlbamId}
              >
                {pendingId === p.mlbamId ? "…" : "Add"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
