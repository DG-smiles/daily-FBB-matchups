import { Player } from "./types";
import rostersData from "./rosters.json";

export interface RosterEntry {
  displayName: string;
  players: Player[];
}

// rosters.json is plain data (no TS types of its own), so it's cast once here.
const rosters = rostersData as Record<string, RosterEntry>;

export interface RosterSummary {
  id: string;
  displayName: string;
}

/**
 * Everyone with a roster — id + display name only, no player data. Safe to
 * expose to anyone: rosters aren't secret, this just powers the "who are
 * you" picker on first visit (see app/page.tsx).
 */
export function listRosters(): RosterSummary[] {
  return Object.entries(rosters).map(([id, entry]) => ({ id, displayName: entry.displayName }));
}

/** One person's roster, or null if the id doesn't exist. */
export function getRoster(id: string): Player[] | null {
  return rosters[id]?.players ?? null;
}

/** A person's display name, or null if the id doesn't exist. Used when
 * writing to Blob storage (lib/rosterStore.ts) since the live roster blob
 * doesn't otherwise know its own owner's display name. */
export function getDisplayName(id: string): string | null {
  return rosters[id]?.displayName ?? null;
}
