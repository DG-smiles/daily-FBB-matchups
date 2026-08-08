import { Hand, ProbablePitcher, ScheduleGame } from "./types";

const MLB_BASE = "https://statsapi.mlb.com/api/v1";

/**
 * ONE call that gets the full day's schedule with both probable pitchers
 * hydrated. This does NOT include throwing hand — MLB's schedule hydrate
 * doesn't reliably return pitchHand, so we do a second, single batched
 * /people call for every probable pitcher's hand. Still just 2 requests
 * total for the whole slate, not per-team.
 */
export async function getTodaysSchedule(dateISO: string): Promise<ScheduleGame[]> {
  const scheduleUrl =
    `${MLB_BASE}/schedule?sportId=1&date=${dateISO}&hydrate=probablePitcher(note)`;

  const res = await fetch(scheduleUrl, { next: { revalidate: 0 } });
  if (!res.ok) {
    throw new Error(`MLB schedule request failed: ${res.status}`);
  }
  const data = await res.json();

  const games: ScheduleGame[] = [];
  const pitcherIdsNeeded = new Set<number>();

  for (const date of data.dates ?? []) {
    for (const game of date.games ?? []) {
      const home = game.teams?.home;
      const away = game.teams?.away;
      const homePitcher = home?.probablePitcher
        ? { id: home.probablePitcher.id, fullName: home.probablePitcher.fullName, throws: null as Hand | null }
        : null;
      const awayPitcher = away?.probablePitcher
        ? { id: away.probablePitcher.id, fullName: away.probablePitcher.fullName, throws: null as Hand | null }
        : null;

      if (homePitcher) pitcherIdsNeeded.add(homePitcher.id);
      if (awayPitcher) pitcherIdsNeeded.add(awayPitcher.id);

      games.push({
        gamePk: game.gamePk,
        homeTeamId: home?.team?.id,
        awayTeamId: away?.team?.id,
        homeTeamAbbrev: home?.team?.abbreviation ?? "",
        awayTeamAbbrev: away?.team?.abbreviation ?? "",
        homeProbablePitcher: homePitcher,
        awayProbablePitcher: awayPitcher,
      });
    }
  }

  // Second call: batch-resolve throwing hand for every probable pitcher at once.
  if (pitcherIdsNeeded.size > 0) {
    const hands = await getPitchHands(Array.from(pitcherIdsNeeded));
    for (const game of games) {
      if (game.homeProbablePitcher) {
        game.homeProbablePitcher.throws = hands[game.homeProbablePitcher.id] ?? null;
      }
      if (game.awayProbablePitcher) {
        game.awayProbablePitcher.throws = hands[game.awayProbablePitcher.id] ?? null;
      }
    }
  }

  return games;
}

async function getPitchHands(personIds: number[]): Promise<Record<number, Hand>> {
  const url = `${MLB_BASE}/people?personIds=${personIds.join(",")}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    throw new Error(`MLB people request failed: ${res.status}`);
  }
  const data = await res.json();
  const out: Record<number, Hand> = {};
  for (const person of data.people ?? []) {
    const code = person.pitchHand?.code as Hand | undefined;
    if (code) out[person.id] = code;
  }
  return out;
}

/** Find a hitter's opponent + probable pitcher for today from the schedule. */
export function resolveOpponent(
  games: ScheduleGame[],
  mlbTeamId: number
): { opponentTeamAbbrev: string; opponentPitcher: ProbablePitcher | null; isHome: boolean } | null {
  for (const game of games) {
    if (game.homeTeamId === mlbTeamId) {
      return {
        opponentTeamAbbrev: game.awayTeamAbbrev,
        opponentPitcher: game.awayProbablePitcher,
        isHome: true,
      };
    }
    if (game.awayTeamId === mlbTeamId) {
      return {
        opponentTeamAbbrev: game.homeTeamAbbrev,
        opponentPitcher: game.homeProbablePitcher,
        isHome: false,
      };
    }
  }
  return null; // team has no game today (off day)
}
