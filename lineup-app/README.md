# Men of Girth — Daily Lineup

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
3. No environment variables needed — everything's a public API call.
4. Deploy. Share the URL with friends.

## Editing your roster

Roster lives in `lib/defaultRoster.ts` — one object per hitter. To add a player:

- **mlbamId**: search `statsapi.mlb.com/api/v1/people/search?names=<first>%20<last>`
  in a browser, or find it in a Baseball Savant URL
  (`baseballsavant.mlb.com/savant-player/<slug>-<mlbamId>`). This is the only ID
  the app actually needs now — it drives both the schedule/pitcher matching and
  the splits pull.
- **fangraphsId**: no longer used by the app's data pulls (splits now come from
  MLB's API), but left in the roster config as a handy reference link if you
  want to manually check a player's FanGraphs page.
- **mlbTeamId**: use the `MLB_TEAM_IDS` map already in `defaultRoster.ts`.

Entries marked `/* VERIFY */` in the current roster were not confirmed live —
check those before trusting their split data.

## Multi-user / friends using this too

Right now the roster is shared/hardcoded for everyone who visits the deployed
site — good for "this is just my team," not good if friends want their own
rosters on the same deployment. Two ways to extend this:

- **Simple**: each friend forks the repo and edits `defaultRoster.ts` with their
  own team, deploys their own copy.
- **Shared app, separate rosters**: move `defaultRoster` into browser
  `localStorage` (read/write it client-side in `app/page.tsx` instead of
  importing the static file) so each visitor's browser remembers their own
  roster. This needs no backend/database — just a bit more UI for adding/editing
  players in-browser instead of editing the TypeScript file directly. Happy to
  build that next if you want it.

## How the recommendation works

For each active hitter (IL/NA excluded):
1. Look up today's opponent + probable pitcher from the schedule.
2. Pull that hitter's season OPS against the pitcher's throwing hand (switch
   hitters use the hand opposite the pitcher, per your original spec).
3. Pull trailing-30-day OPS as a secondary "hot/cold" signal.
4. Sort by `0.7 × season-vs-hand OPS + 0.3 × recent OPS` (weights are in
   `lib/recommend.ts` — `recommendationScore()` — tune freely).

This doesn't yet enforce your 13-active-slot / position-eligibility rules — it's
a ranked list, not an auto-filled lineup. That's the natural next feature if you
want to keep building this out.
