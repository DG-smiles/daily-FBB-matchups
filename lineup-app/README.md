# Daily Lineup Analysis

One-click daily fantasy lineup tool. Pulls today's probable pitchers, batter
platoon splits + recent form, and opposing-SP quality splits — all from the
MLB Stats API — and blends them into a single SIT score per hitter (see
below). Everything runs server-side, so there's no CORS issue and no
per-player manual lookups.

## How the SIT score works

For each active hitter, four inputs are blended into one 0–100 score
(`lib/recommend.ts`) — **0 = clear start, 100 = clear bench**:

| Component | Base weight | Full-confidence at |
|---|---|---|
| Opposing SP's season OPS *allowed* vs the batter's side | 45% | 15 PA |
| Batter's season OPS vs the opposing SP's hand | 25% | 15 PA |
| Batter's trailing 30-day OPS | 20% | 20 PA |
| Batter's trailing 10-day OPS | 10% | 10 PA |

Each OPS is mapped to a 0–100 "quality" score (.500 OPS → 0, 1.100 OPS → 100,
linear between). Below a component's PA threshold, its weight scales down
linearly toward 0 (a 5-PA sample gets ~1/3 the weight a 15-PA sample would)
and the remaining weight is redistributed proportionally across the other
components — so a small-sample stat never swings the score as hard as a
reliable one, and missing data (0 PA) drops a component out entirely rather
than being treated as a zero.

**SB Bonus (not part of the weighted blend):** applied as a flat reduction
*after* the four components above are blended, since stolen-base activity is
a start/sit signal OPS doesn't capture. Based on the batter's trailing-30-day
SB/CS: **-2 SIT points per SB, -1 per CS**, floored at 0.

The full breakdown (OPS, PA, and each component's actual contribution %
after redistribution, plus the SB bonus line) is shown on every hitter's
card, not just the final number — so you can see *why* a SIT score landed
where it did.

## Total network calls per pull

- 1 per **distinct MLB team** in your roster pool, for live roster status
  (`rosterType=40Man`) — usually ~13-15, not one per player.
- 1 to MLB for the day's schedule + all probable pitchers' hands (batched).
- 3 per active hitter (season platoon split, 30-day form, 10-day form) — 17
  hitters ≈ 51 calls.
- 1 per **unique** opposing starting pitcher (season split allowed) — shared
  starters (two of your hitters facing the same SP) only cost one call, so
  this is usually ~10–11, not 17.

All to MLB's own public Stats API — no FanGraphs, no scraping.

## ⚠️ Built without live testing — read this first

This was built in an environment with no internet access for the *code itself*,
though the underlying API calls were verified live via a separate research pass:

- **Round 1** tried FanGraphs' internal `/api/leaders/major-league/data` endpoint
  (used by `pybaseball`) — 403'd from Vercel even with full browser headers,
  likely an IP-range block on that specific endpoint.
- **Round 2** switched to scraping FanGraphs' individual `/splits` pages — also
  abandoned.
- **Round 3 (current)**: discovered MLB's own Stats API supports platoon splits
  directly — `/api/v1/people/{mlbamId}/stats?stats=statSplits&group=hitting&sitCodes=vl,vr&season=YYYY`
  — and **this was confirmed live** with real data (tested against a real player,
  got back actual `vl`/`vr` split rows with `ops` as a direct field). This is
  now the only external data source besides the schedule call — no FanGraphs,
  no scraping, no cheerio dependency.

**What's confirmed working:** the batter platoon-split call (`group=hitting`),
and the schedule + pitcher-hand calls (`lib/mlb.ts`) — all tested live.

**What's NOT yet confirmed:**
- `getRecentForm()` (`stats=byDateRange`) — used for both the 30-day and
  10-day windows. Same endpoint family, documented as real in MLB Stats API
  wrapper libraries, but not tested live with actual output.
- `getPitcherPlatoonSplits()` (`group=pitching&sitCodes=vl,vr`) — same call
  shape as the confirmed batter version, just the pitching stat group instead
  of hitting. Untested whether MLB returns the same field names for pitchers
  (e.g. `ops` as OPS *allowed*) or a different shape.

If either fails or comes back empty:

1. Visit `/api/debug-mlb?player=<mlbamId>&type=recent&group=hitting&days=10`
   (swap `days=30`, `group=pitching`, `type=splits` as needed) on your
   deployed site — returns the raw MLB response for that exact call.
2. Compare against `?player=682985&type=splits&group=hitting` (the
   confirmed-working call) to see if the response shape differs.
3. Paste the output back and the parsing in `lib/mlbSplits.ts` can be
   adjusted precisely.

Everything is one fetch per active hitter per stat type (no confirmed
batch-multiple-players endpoint exists for this stats family), but it's
MLB's own public API rather than a page that can rate-limit or block
scraping — much better reliability
odds than the FanGraphs rounds.

## Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, pick a date, click "Pull today's lineup."

## Deploy to Vercel

1. Push this repo to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new), import the repo.
3. In your project → **Storage** tab → **Create Database** → **Blob**, and
   connect it to this project. This is what makes in-app add/drop actually
   persist — see "Rosters" below for why a plain repo file can't. Vercel
   adds the `BLOB_READ_WRITE_TOKEN` environment variable automatically;
   nothing to copy/paste.
4. Deploy.
5. Share the URL with whoever's on the list in `lib/rosters.json`. First
   visit, they tap their name once; it's remembered on their device after
   that. See "Rosters" below.

**Local dev:** run `vercel env pull` once to get `BLOB_READ_WRITE_TOKEN` into
`.env.local`, or add/drop won't work on `localhost` (reading still will).

## Rosters

Everyone's roster — yours and any friends' — starts from one place:
`lib/rosters.json`, one entry per person, current-roster-only (no history).
Nothing in here is secret or access-controlled; everyone's roster is visible
to everyone else who opens the app, same as it would be in a real league.

**Reading vs. writing** — two different places, on purpose:
- `lib/rosters.json` (this repo) is each person's *starting* roster, and the
  id → display-name directory the "who's this?" picker uses. It's read-only
  once deployed — a running Vercel function can't write back to a file
  that's part of the deployed build.
- Add/drop (`lib/rosterStore.ts`) writes to **Vercel Blob** instead — one
  JSON blob per person, seeded from `rosters.json` the first time anyone
  adds or drops for that person, live from then on. Still just a JSON blob,
  not a real database — it's the smallest thing that's actually writable at
  runtime. `/api/roster` and `/api/roster-status` (used for the initial
  "who's this" pick and IL/NA status, not for add/drop) read from Blob and
  fall back to the seed file if nothing's been written yet.
- Add/drop deliberately does **not** re-read Blob as the basis for a write.
  It's a read-modify-write under the hood, and re-reading Blob immediately
  before writing (even hardened with ETag-based optimistic concurrency)
  still lost entries in testing when adding a few seconds apart — Vercel
  Blob's read-after-write consistency lagged behind further than expected
  under repeated overwrites of the same pathname. Instead, `RosterManager`
  sends its own already-correct roster state with every add/drop request,
  and the server just saves "that list, plus/minus one player" directly —
  no dependency on Blob's read consistency for correctness. This is safe
  because the client only ever has one add/drop in flight at a time (the
  `mutating` lock in `components/RosterManager.tsx` — every button is
  disabled while any request is pending, and it isn't just a UX nicety here,
  it's load-bearing). The tradeoff: two *different* devices editing the same
  person's roster in the same few seconds could still race — much narrower
  than what was actually happening, and not a pattern this app's usage
  (one person, their own roster) runs into in practice.

**Adding a friend:** copy this block into `lib/rosters.json`, give it a short
id key and their name, and start them with an empty roster (or seed a
starting one using the same shape as the existing entries):

```json
"friend-id": {
  "displayName": "Their Name",
  "players": []
}
```

They open the app link, tap their name once, and from then on their device
remembers it automatically — same as yours does. There's a "Not you? Switch"
link in the app if a device needs to change who it's showing. This part
still needs a commit + redeploy (it's a one-time-per-friend thing); the
players *within* a roster are what add/drop manages without a redeploy.

## Adding/dropping players in-app

"Manage roster" (next to your name in the app) opens a screen backed by
`/api/players` — every hitter who appeared on an MLB roster this season
(`sports/1/players`), not just yours. Search by name or team, add, or drop
someone already on your roster. Current-state-only, same as everything
else here — dropping a player doesn't keep any history.

**Position eligibility matches Yahoo's actual rule**, not just MLB's single
"primary position": a player qualifies at a position with 5 starts *or* 10
total appearances there, met in the current season *or* the prior one
(Yahoo's retention rule — you keep a position all season if you qualified
either this year or last). This runs automatically on add
(`getEligiblePositions` in `lib/mlb.ts`, pulling fielding-by-position stats
for both seasons) — only the 8 non-pitcher fielding positions are checked;
every hitter is treated as silently DH/UTIL-eligible regardless, since
neither league config actually has a distinct DH slot (UTIL already accepts
anyone). MLB's reported primary position is always included even if the
games/starts computation somehow doesn't clear the bar for it — that
designation is authoritative and never gets silently dropped. If the lookup
fails for any reason, the add still goes through with just the primary
position rather than blocking.

**"Refresh position eligibility"** (top of the roster-manager panel)
re-runs this for every player already on the roster — for a trade, a
position change, or just to pick up positions someone gained mid-season.
Rate-limited to once a minute per person (see "Rate limiting" below) since
a full roster can be ~50 MLB calls in one press; the button disables (with
"Refreshing…") while it's running, and every add/drop button disables along
with it, since only one roster save should be in flight at a time.

**Not verified against live output** — built without a way to hit the real
API first. If eligibility looks wrong for someone after deploying,
`/api/debug-mlb?player=<mlbamId>&type=fielding&season=YYYY` shows MLB's raw
response to compare against what the app computed.

## Rate limiting

A couple of actions here fan out into a lot of MLB calls from one button
press, and both are rate-limited (`lib/rateLimit.ts`, a small Blob-backed
cooldown record — not exact to the millisecond, but that's fine for a
cooldown, unlike roster data):

- **Refresh position eligibility**: once per 5 seconds per person — up to
  ~19 players × up to 3 calls each is the single biggest burst anywhere in
  this app, so this is the lighter-touch end of what's reasonable, not a
  strict guarantee against a determined bad actor.
- **Pull today's lineup**: once per 5 seconds per person, as a backstop
  behind the UI's own loading-disabled button — light on purpose, since
  pulling is the app's core, legitimately-frequent action.

Individual add/drop is deliberately **not** rate-limited beyond the
in-flight `busy` lock already in `RosterManager` — each one is a single MLB
call, not a multiplier, and adding friction there would undo the "rapid
sequential adds should just work" fix from earlier in this project's history.

## Active roster slot layouts (leagues)

Two fantasy leagues are in play, with different active-slot structures —
`lib/leagueConfig.ts` hardcodes both, since neither changes year to year:

- **Daniel G** (13 slots): C, 1B, 2B, 3B, SS, CI, MI, LF, CF, RF, OF, OF, UTIL
- **Everyone else** (10 slots): C, 1B, 2B, 3B, SS, OF, OF, OF, UTIL, UTIL

`getLeagueConfig(userId)` is the only place this is decided — `userId ===
"daniel-g"` gets the 13-slot layout, every other id gets the 10-slot one.
`lib/assignLineup.ts` doesn't know or care which league it's filling; it
just takes whatever slot list it's given and finds the lowest-total-SIT
complete assignment for it, so the same warning/bench/fill-every-slot
behavior holds for both. If a third league shape ever shows up, this file
is where to generalize past a two-case hardcode (e.g. a `league` field per
person in `lib/rosters.json`).

## Editing a roster

To hand-edit a player's entry (in `lib/rosters.json`, or a live Blob copy):

- **mlbamId**: search `statsapi.mlb.com/api/v1/people/search?names=<first>%20<last>`
  in a browser, or find it in a Baseball Savant URL
  (`baseballsavant.mlb.com/savant-player/<slug>-<mlbamId>`). This is the only ID
  the app needs — it drives the schedule/pitcher matching, the splits pull,
  and position-eligibility resolution.
- **mlbTeamId**: use the `MLB_TEAM_IDS` map in `lib/mlbTeams.ts`.

Walker Jenkins is currently seeded with a placeholder `mlbamId: 0` — no
real id was ever found for him, so he's excluded from live IL/NA status
resolution until one's filled in.

## Multi-user / friends using this too

Everyone shares one deployment and picks their own roster by name (see
"Rosters" above) — there's no login, because nothing here needed to be
secret. Add/drop (above) is built; nothing else is currently on the roadmap.

## How a daily pull works, end to end

On "Pull today's lineup":

1. **Live roster status** (`/api/roster-status?user=<id>` → `lib/mlb.ts`,
   `getRosterStatuses`) — pulls the 40-man roster for every distinct MLB team
   in that person's pool and resolves each player's current status (active /
   IL / NA) fresh, right then. This is what catches a player landing on the
   IL the morning of games, or coming off it, without anyone hand-editing
   `lib/rosters.json`. The hardcoded `status` field there is only a
   same-day-offline fallback.
2. **Schedule + probable pitchers** (`/api/schedule`), same as before.
3. **SIT scores** (`/api/splits` → `lib/recommend.ts`) for every player the
   live status check just confirmed is active — see the scoring table above.
   A player with no game today at all gets a real "no score" (`null`), not a
   number derived from stale recent-form data — see the note on that in
   `lib/recommend.ts`.
4. **Lineup assignment** (`lib/assignLineup.ts`) — fills all 13 active slots
   from the day's scored, active hitters, minimizing total SIT score across
   the filled slots via the Hungarian algorithm (optimal min-cost bipartite
   matching, not greedy sorting — this guarantees every slot gets filled
   whenever a valid assignment exists, even when a scarce position's only
   eligible player would otherwise get grabbed by a flex slot first).
   Deliberately doesn't weight by position scarcity — every slot's cost is
   just the player's SIT score. If the single highest SIT score in the whole
   pool ends up starting anyway (no better option existed for their slot), a
   warning banner says so.

The result renders as a clean decision view (`components/LineupDecisionView.tsx`)
at the top of the page — bench first (worst matchup first, so the obvious
sits are out of the way early), then who starts where, then who's excluded
and why. Every row expands in place to the same full SIT breakdown a
separate data-grid section used to show — same data, same look, just
reachable per-row now instead of in one big block underneath.
