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
 * CONCURRENCY DESIGN — read this before changing add/drop:
 * The first version of this read the current roster from Blob immediately
 * before every write (a standard read-modify-write, later hardened with
 * ETag-based optimistic concurrency). In practice, rapid sequential
 * add/drops — a few seconds apart, each one's request fully completed
 * before the next started — still silently lost entries. That points to
 * Vercel Blob's own read-after-write consistency (via head()/fetch on the
 * public URL) lagging behind a just-completed write by more than a few
 * seconds under repeated overwrites of the same pathname, even with
 * cache-busting query params and a short cacheControlMaxAge. Rather than
 * keep fighting that, mutateRoster() no longer re-reads Blob as the basis
 * for a write at all: the CALLER (app/api/roster/add and .../drop) passes
 * in the roster it already knows to be current — which is safe because the
 * client only ever has one add/drop in flight at a time (see the `mutating`
 * lock in components/RosterManager.tsx) and updates its own local state
 * from each response before allowing the next action. The write is then
 * just "this known-good list, plus/minus one player," saved directly — no
 * dependency on Blob's read consistency for correctness.
 *
 * The tradeoff: this assumes one active editor at a time per person's
 * roster. Two *different* devices editing the same person's roster in the
 * same few seconds could still race — a much narrower case than what was
 * actually happening, and not a scenario this app's usage pattern (one
 * person, their own roster) runs into in practice.
 *
 * IMPORTANT — CDN caching still applies to plain reads: Vercel's CDN caches
 * blob content by URL for up to a month by default. getLiveRoster() (used
 * for the initial "who's this" pick and IL/NA status resolution, not
 * add/drop) still cache-busts its read for the same reason as before — see
 * the comment there.
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

/** Current roster for a user — the live Blob copy if one exists, otherwise
 * the seed data from lib/rosters.json. Returns null only if the userId
 * isn't a known roster at all. Used for the initial "who's this" pick and
 * IL/NA status resolution — NOT by add/drop, see the file-level comment. */
export async function getLiveRoster(userId: string): Promise<Player[] | null> {
  const seedPlayers = getSeedRoster(userId);
  if (seedPlayers === null) return null; // not a known user at all

  try {
    const meta = await head(blobPath(userId));
    const bustUrl = `${meta.url}?v=${Date.now()}`;
    const res = await fetch(bustUrl, { cache: "no-store" });
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

/**
 * Saves an already-fully-known roster array directly — no read, no
 * modification, just persist exactly what's passed in. Used by add/drop
 * (via addPlayer/dropPlayer below) and by the position-eligibility refresh
 * flow (app/api/roster/refresh-positions), which recomputes every player's
 * eligiblePositions client-side-known-roster-in, then saves the result the
 * same way — no server-side re-read of Blob as the basis for the write, for
 * the same reason described in the file-level comment above.
 */
export async function saveRoster(
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
    cacheControlMaxAge: 60,
  });
}

/**
 * Adds a player to `currentRoster` (the caller's known-current list — see
 * file-level comment) and saves the result. No-op, not an error, if the
 * player's already in it.
 */
export async function addPlayer(
  userId: string,
  displayName: string,
  currentRoster: Player[],
  player: Player
): Promise<Player[]> {
  if (currentRoster.some((p) => p.mlbamId === player.mlbamId)) {
    return currentRoster;
  }
  const updated = [...currentRoster, player];
  await saveRoster(userId, displayName, updated);
  return updated;
}

/**
 * Drops a player (by roster-local id) from `currentRoster` (the caller's
 * known-current list — see file-level comment) and saves the result.
 */
export async function dropPlayer(
  userId: string,
  displayName: string,
  currentRoster: Player[],
  playerId: string
): Promise<Player[]> {
  const updated = currentRoster.filter((p) => p.id !== playerId);
  await saveRoster(userId, displayName, updated);
  return updated;
}
