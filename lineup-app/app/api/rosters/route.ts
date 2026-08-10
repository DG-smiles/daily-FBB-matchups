import { NextResponse } from "next/server";
import { listRosters } from "@/lib/rosters";

export const dynamic = "force-dynamic";

/**
 * GET /api/rosters
 *
 * Everyone with a roster — id + display name only, no player data. Powers
 * the "who are you" picker on first visit. No access check: rosters aren't
 * secret (see lib/rosters.json), this list just says who's available.
 */
export async function GET() {
  return NextResponse.json({ rosters: listRosters() });
}
