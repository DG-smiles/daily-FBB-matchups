import { put, head, BlobPreconditionFailedError } from "@vercel/blob";
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
 * IMPORTANT #1 — CDN caching: Vercel's CDN caches blob content by URL for up
 * to a month by default, and does not automatically invalidate that cache
 * when you overwrite the same pathname (`allowOverwrite: true` replaces the
 * content, not the cache). Every read here cache-busts with a unique query
 * param to guarantee freshness — don't fetch `meta.url` directly elsewhere
 * without doing the same, or you'll silently get stale roster data back.
 *
 * IMPORTANT #2 — concurrent writes: add/drop is a read-modify-write (read
 * the current roster, change it, write the whole thing back). If two
 * mutations for the same person overlap — e.g. clicking Add on a second
 * player before the first one's request has finished — the second write can
 * be based on data that doesn't include the first change yet, silently
 * clobbering it (a "lost update"). Every mutation here goes through
 * mutateRoster(), which uses the blob's ETag for optimistic concurrency: it
 * conditions the write on the roster not having changed since it was read,
 * and retries against fresh data if it has. This is the standard fix for
 * read-modify-write races on any shared object store, not something
 * specific to this app.
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

interface LiveRosterState {
  players: Player[];
  /** null means no blob has ever been written for this person yet — reads
   * are still coming from the lib/rosters.json seed. */
  etag: string | null;
}

function blobPath(userId: string): string {
  return `rosters/${userId}.json`;
}

async function readLiveRosterState(userId: string): Promise<LiveRosterState | null> {
  const seedPlayers = getSeedRoster(userId);
  if (seedPlayers === null) return null; // not a known user at all

  try {
    const meta = await head(blobPath(userId));
    // See "IMPORTANT #1" above — cache-bust every read.
    const bustUrl = `${meta.url}?v=${Date.now()}`;
    const res = await fetch(bustUrl, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as StoredRoster;
      return { players: data.players, etag: meta.etag };
    }
  } catch {
    // No blob written yet for this user — that's normal, not an error.
    // Fall through to seed data below.
  }
  return { players: seedPlayers, etag: null };
}

/** Current roster for a user — the live Blob copy if one exists, otherwise
 * the seed data from lib/rosters.json. Returns null only if the userId
 * isn't a known roster at all. */
export async function getLiveRoster(userId: string): Promise<Player[] | null> {
  const state = await readLiveRosterState(userId);
  return state ? state.players : null;
}

const MAX_ATTEMPTS = 5;

/**
 * Runs a read-modify-write against a person's roster safely under
 * concurrent calls. `mutate` receives the current player list and returns
 * the new one — return the exact same array reference (not a copy) for a
 * no-op, and the write is skipped entirely.
 *
 * See "IMPORTANT #2" above for why this exists instead of a plain
 * read-then-write.
 */
async function mutateRoster(
  userId: string,
  displayName: string,
  mutate: (current: Player[]) => Player[]
): Promise<Player[]> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const state = await readLiveRosterState(userId);
    if (state === null) {
      throw new Error(`Unknown user "${userId}"`);
    }

    const updated = mutate(state.players);
    if (updated === state.players) {
      return updated; // no real change (e.g. adding someone already rostered)
    }

    try {
      await put(blobPath(userId), JSON.stringify({ displayName, players: updated } as StoredRoster), {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
        // The actual concurrency fix: only write if nobody else's write
        // landed since we read `state`. `etag` is null for a person's very
        // first-ever mutation (no blob exists yet to condition on) — that
        // one narrow case isn't retry-protected, but every mutation after
        // it is.
        ...(state.etag ? { ifMatch: state.etag } : {}),
      });
      return updated;
    } catch (err) {
      const isConflict = err instanceof BlobPreconditionFailedError;
      if (!isConflict || attempt === MAX_ATTEMPTS) throw err;
      // Someone else's add/drop won the race — small backoff, then loop
      // around to re-read the now-current state and retry on top of it,
      // instead of silently overwriting their change.
      await new Promise((r) => setTimeout(r, 120 * attempt));
    }
  }
  throw new Error("Couldn't save the roster after several attempts — please try again.");
}

/** Adds a player if they're not already rostered (no-op, not an error, if
 * they are). Returns the resulting roster either way. */
export async function addPlayer(
  userId: string,
  displayName: string,
  player: Player
): Promise<Player[]> {
  return mutateRoster(userId, displayName, (current) => {
    if (current.some((p) => p.mlbamId === player.mlbamId)) return current;
    return [...current, player];
  });
}

/** Drops a player by their roster-local id. Returns the resulting roster. */
export async function dropPlayer(
  userId: string,
  displayName: string,
  playerId: string
): Promise<Player[]> {
  return mutateRoster(userId, displayName, (current) =>
    current.filter((p) => p.id !== playerId)
  );
}
