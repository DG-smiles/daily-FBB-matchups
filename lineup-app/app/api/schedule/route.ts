import { NextRequest, NextResponse } from "next/server";
import { getTodaysSchedule } from "@/lib/mlb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "Missing ?date=YYYY-MM-DD" }, { status: 400 });
  }
  try {
    const games = await getTodaysSchedule(date);
    return NextResponse.json({ games });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 502 });
  }
}
