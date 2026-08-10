import { put, head } from "@vercel/blob";
import { Player } from "./types";
import { getRoster as getSeedRoster } from "./rosters";

/**
 * Why this exists: lib/rosters.json is checked into the repo, which is
 * read-only once deployed — a running Vercel function can't write back to
 * it. Add/drop needs somewhere that's actually writable at runtime. Vercel
 * Blob is the smallest thing that does that: still just a JSON blob per
 * person, no schema, no query language — as close to "just a JSON file" as
 * persistence gets on Vercel.
 *
 * rosters.json remains the source of truth for WHO has a roster (the id +
 * displayName "directory" — see lib/rosters.ts) and each person's STARTING
 * players. The live, mutated player list — once anyone has ever added or
 * dropped a player — lives in Blob instead, one blob per person.
 *
 * SETUP: in the Vercel dashboard, go to your project → Storage → Create
 * Database → Blob, and connect it to this project. Vercel adds the
 * BLOB_READ_WRITE_TOKEN environment variable automatically — nothing to
 * copy/paste by hand. For local dev, run `vercel env pull` to get that same
 * variable into `.env.local`, or add/drop just won't work on localhost.
 */

interface StoredRoster {
  displayName: string;
  players: Player[];
}

function blobPath(userId: string): string {
  return `rosters/${userId}.json`;
}

/**
 * Current roster for a user — the live Blob copy if one exists (i.e.
 * someone has ever added/dropped for this person), otherwise the seed data
 * from lib/rosters.json. Returns null only if the userId isn't a known
 * roster at all.
 */
export async function getLiveRoster(userId: string): Promise<Player[] | null> {
  const seedPlayers = getSeedRoster(userId);
  if (seedPlayers === null) return null; // not a known user at all

  try {
    const meta = await head(blobPath(userId));
    const res = await fetch(meta.url, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as StoredRoster;
      return data.players;
    }
  } catch {
    // No blob written yet for this user — that's normal, not an error.
    // Fall through to seed data below.
  }
  return seedPlayers;
}

async function writeLiveRoster(
  userId: string,
  displayName: string,
  players: Player[]
): Promise<void> {
  const body: StoredRoster = { displayName, players };
  await put(blobPath(userId), JSON.stringify(body), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/** Adds a player if they're not already rostered (no-op, not an error, if
 * they are). Returns the resulting roster either way. */
export async function addPlayer(
  userId: string,
  displayName: string,
  player: Player
): Promise<Player[]> {
  const current = (await getLiveRoster(userId)) ?? [];
  if (current.some((p) => p.mlbamId === player.mlbamId)) {
    return current;
  }
  const updated = [...current, player];
  await writeLiveRoster(userId, displayName, updated);
  return updated;
}

/** Drops a player by their roster-local id. Returns the resulting roster. */
export async function dropPlayer(
  userId: string,
  displayName: string,
  playerId: string
): Promise<Player[]> {
  const current = (await getLiveRoster(userId)) ?? [];
  const updated = current.filter((p) => p.id !== playerId);
  await writeLiveRoster(userId, displayName, updated);
  return updated;
}
