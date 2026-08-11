import { put, head } from "@vercel/blob";

/**
 * A simple cooldown: "has `key` been used within the last `windowMs`?" —
 * backed by a tiny Blob record so it holds across serverless cold starts
 * and multiple instances, not just within one warm function. This is a
 * best-effort limiter, not a hard distributed guarantee — Blob reads can
 * lag by a couple seconds under load (see lib/rosterStore.ts) — but that
 * imprecision is fine here. A cooldown being off by a second or two is a
 * non-issue; it isn't roster data that would be silently lost.
 *
 * Used to bound the app's few actions that fan out into many MLB calls per
 * click: refreshing a whole roster's position eligibility, and pulling a
 * day's lineup. Deliberately NOT applied to individual add/drop — each one
 * is a single MLB call, not a multiplier, and adding friction there would
 * undo the "rapid sequential adds should just work" fix from earlier.
 */
export async function checkCooldown(
  key: string,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const path = `cooldowns/${key}.json`;

  try {
    const meta = await head(path);
    const bustUrl = `${meta.url}?v=${Date.now()}`;
    const res = await fetch(bustUrl, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { lastAt: number };
      const elapsed = Date.now() - data.lastAt;
      if (elapsed < windowMs) {
        return { allowed: false, retryAfterMs: windowMs - elapsed };
      }
    }
  } catch {
    // No cooldown record yet for this key — allowed.
  }

  await put(path, JSON.stringify({ lastAt: Date.now() }), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  });
  return { allowed: true, retryAfterMs: 0 };
}
