# Men of Girth — Daily Lineup

One-click daily fantasy lineup tool. Pulls today's probable pitchers (MLB Stats API)
and season platoon splits + trailing-30-day form for your whole roster (FanGraphs),
computed server-side so there's no CORS issue and no per-player manual lookups.

**Total network calls per pull: 3.** One to MLB (schedule + pitcher hands, batched),
two to FanGraphs (vs-LHP and vs-RHP splits, batched across your whole roster in one
call each), plus a third for trailing-30-day form. Compare to ~35 individual lookups
doing this by hand.

## ⚠️ Built without live testing — read this first

This was built in an environment with no internet access, so **the code has never
actually been run against the live APIs**. The logic and endpoints are based on
documented, working examples (MLB Stats API docs, and a FanGraphs API pattern used
by the `pybaseball` Python library), but there are two likely failure points on
your first run:

1. **FanGraphs API rejecting the request.** Their `/api/leaders/major-league/data`
   endpoint may check for more than just a User-Agent/Referer header — possibly a
   session cookie. If `getBatchSplit` / `getBatchRecentForm` in `lib/fangraphs.ts`
   error out:
   - Open `fangraphs.com/leaders/major-league` in a real browser, open DevTools →
     Network tab, reload, and find the request to `/api/leaders/major-league/data`.
   - Copy its request headers (especially `Cookie` if present) into `FG_HEADERS`
     in `lib/fangraphs.ts`.
   - If FanGraphs' response JSON shape doesn't match what `lib/fangraphs.ts`
     expects (field names like `OBP`/`SLG`/`AVG`/`playerid`), open that same
     Network tab response and adjust the `FgRow` interface and parsing to match.

2. **The `month` split codes.** `13` = vs LHP and `14` = vs RHP were reverse-
   engineered from FanGraphs' own site links, and `1000` for the custom date-range
   mode is a guess based on their UI having a "Custom Date Range" option — verify
   this actually returns the date-filtered data you expect, and adjust if not.

Budget 20–30 minutes of debugging against the real APIs on first deploy. After
that, it should just work daily.

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
  (`baseballsavant.mlb.com/savant-player/<slug>-<mlbamId>`).
- **fangraphsId**: find the player's FanGraphs page, the ID is the number in the URL
  (`fangraphs.com/players/<slug>/<fangraphsId>/stats`).
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
