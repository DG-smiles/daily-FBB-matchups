/**
 * Active roster slot layouts. Two fantasy leagues are in play here, with
 * different slot structures, and both are unchanging year to year — so this
 * is a one-time, two-case hardcode rather than a general per-user config
 * system. If a third league shape shows up later, this is the file to
 * generalize (e.g. into its own per-user field in lib/rosters.json).
 */

export interface SlotDef {
  id: string;
  label: string;
  eligible: (positions: string[]) => boolean;
}

export interface LeagueConfig {
  slots: SlotDef[];
}

const hasPos = (pos: string) => (positions: string[]) => positions.includes(pos);
const CORNER_INFIELD = (p: string[]) => p.includes("1B") || p.includes("3B");
const MIDDLE_INFIELD = (p: string[]) => p.includes("2B") || p.includes("SS");
const OUTFIELD = (p: string[]) => p.includes("LF") || p.includes("CF") || p.includes("RF");
const ANY = () => true;

/**
 * Daniel G's league: C, 1B, 2B, 3B, SS, CI, MI, LF, CF, RF, OF, OF, UTIL
 * (13 active slots) — matches the original roster-spots table this app was
 * built around.
 */
export const DANIEL_G_LEAGUE: LeagueConfig = {
  slots: [
    { id: "C", label: "C", eligible: hasPos("C") },
    { id: "1B", label: "1B", eligible: hasPos("1B") },
    { id: "2B", label: "2B", eligible: hasPos("2B") },
    { id: "3B", label: "3B", eligible: hasPos("3B") },
    { id: "SS", label: "SS", eligible: hasPos("SS") },
    { id: "CI", label: "CI", eligible: CORNER_INFIELD },
    { id: "MI", label: "MI", eligible: MIDDLE_INFIELD },
    { id: "LF", label: "LF", eligible: hasPos("LF") },
    { id: "CF", label: "CF", eligible: hasPos("CF") },
    { id: "RF", label: "RF", eligible: hasPos("RF") },
    { id: "OF1", label: "OF", eligible: OUTFIELD },
    { id: "OF2", label: "OF", eligible: OUTFIELD },
    { id: "UTIL", label: "UTIL", eligible: ANY },
  ],
};

/**
 * Everyone else's league: C, 1B, 2B, 3B, SS, OF, OF, OF, UTIL, UTIL
 * (10 active slots) — no CI/MI, no split LF/CF/RF, one more OF and UTIL
 * slot instead.
 */
export const STANDARD_LEAGUE: LeagueConfig = {
  slots: [
    { id: "C", label: "C", eligible: hasPos("C") },
    { id: "1B", label: "1B", eligible: hasPos("1B") },
    { id: "2B", label: "2B", eligible: hasPos("2B") },
    { id: "3B", label: "3B", eligible: hasPos("3B") },
    { id: "SS", label: "SS", eligible: hasPos("SS") },
    { id: "OF1", label: "OF", eligible: OUTFIELD },
    { id: "OF2", label: "OF", eligible: OUTFIELD },
    { id: "OF3", label: "OF", eligible: OUTFIELD },
    { id: "UTIL1", label: "UTIL", eligible: ANY },
    { id: "UTIL2", label: "UTIL", eligible: ANY },
  ],
};

/** Hardcoded per-user league lookup — see file comment. */
export function getLeagueConfig(userId: string): LeagueConfig {
  return userId === "daniel-g" ? DANIEL_G_LEAGUE : STANDARD_LEAGUE;
}
