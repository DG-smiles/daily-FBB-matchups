import { NextRequest, NextResponse } from "next/server";
import { getLiveRoster } from "@/lib/rosterStore";
import { getRosterStatuses } from "@/lib/mlb";
import { checkCooldown } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// Light touch on purpose — this is the app's core, legitimately-frequent
// action, not something to add real friction to. It exists as a backstop
// against something bypassing the UI's own loading-disabled button (which
// already prevents the normal double-click case) and rapid-firing this
// directly, not to slow down a normal "pull, fix something, pull again."
const PULL_COOLDOWN_MS = 5_000;

/**
 * GET /api/roster-status?user=<id>
 *
 * Resolves that person's CURRENT roster's active/IL/NA status live from the
 * MLB Stats API. Called on every "Pull today's lineup" alongside
 * /api/schedule so a same-day IL move or activation is caught automatically
 * — the `status` field hardcoded in lib/rosters.json is only a
 * same-day-offline fallback.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user");
  if (!userId) {
    return NextResponse.json({ error: "Missing ?user=<id>" }, { status: 400 });
  }

  const cooldown = await checkCooldown(`pull-${userId}`, PULL_COOLDOWN_MS);
  if (!cooldown.allowed) {
    return NextResponse.json(
      { error: `Please wait ${Math.ceil(cooldown.retryAfterMs / 1000)}s before pulling again.` },
      { status: 429 }
    );
  }

  const roster = await getLiveRoster(userId);
  if (!roster) {
    return NextResponse.json({ error: `No roster found for "${userId}"` }, { status: 404 });
  }

  try {
    const players = roster
      .filter((p) => p.mlbamId > 0) // skip unverified placeholder entries (mlbamId: 0)
      .map((p) => ({ mlbamId: p.mlbamId, mlbTeamId: p.mlbTeamId }));

    const statuses = await getRosterStatuses(players);
    return NextResponse.json({ statuses });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 502 });
  }
}
