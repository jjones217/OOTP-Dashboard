# OOTP League Dashboard

Personal GM dashboard for OOTP Online leagues hosted on
[StatsPlus](https://statsplus.net). Shows sim date, export status, W-L
record, and team batting/pitching stats for each of your leagues, plus a
per-league view with player browsing, tool-rating radar charts, standings,
and league-wide team stats.

**Dataflow: pull, don't poll.** Nothing fetches automatically. Clicking a
**⬇ Pull data** button is the only thing that talks to StatsPlus; that
pull writes the result to a local cache, and every view in the app always
renders from that cache — including right after an app restart, with zero
network calls, showing whatever was last pulled. See
[Data storage](#data-storage) for where the cache lives.

Runs two ways from the same codebase:

- **Desktop app** (Windows + macOS, Electron) — talks to StatsPlus
  directly, no proxy or hosting needed
- **Web app** at **ootp.navhawk.net** on Vercel

## Stack

- React + Vite + Tailwind CSS
- Electron (`electron/`) — desktop shell; the main process fetches from
  StatsPlus directly
- Vercel serverless function (`api/proxy.js`) — proxies StatsPlus API calls
  for the web app, because StatsPlus doesn't send CORS headers

## Data storage

Everything is stored locally on each computer — no cloud database, no
server-side persistence:

- **League configs** (name, StatsPlus URL, team ID): a `leagues.json` file
  in the app's per-user data folder
  - Windows: `%APPDATA%\OOTP Dashboard\leagues.json`
  - macOS: `~/Library/Application Support/OOTP Dashboard/leagues.json`
- **Pulled StatsPlus data** (teams, players, stats, ratings): one JSON
  file per league in that same folder's `data\` subdirectory (e.g.
  `%APPDATA%\OOTP Dashboard\data\<league-id>.json`), holding the raw
  response and a `fetchedAt` timestamp for each endpoint.
- **Web app / dev server**: both of the above fall back to browser
  localStorage.

Each computer keeps its own leagues and pulled data — a league added (or
data pulled) on one machine doesn't appear on another. Both JSON files can
be copied between machines to transfer everything as of the last pull.

## StatsPlus API

Requests follow the pattern `https://statsplus.net/{lgurl}/api/{endpoint}/`
(docs: https://wiki.statsplus.net/web-tools/statsplus-api). Endpoints used:
`date`, `exports`, `teams`, `teambatstats`, `teampitchstats`, `players`,
`playerbatstatsv2?year=N`, `playerpitchstatsv2?year=N`, and `ratings`.
Responses are JSON or CSV; the client handles both.

Two things are special:

- **Auth is the StatsPlus browser login (cookies), not an API token.** The
  desktop app has a "Sign in to StatsPlus" button that opens a login
  window; after that, API calls run with that session. The web app can
  only use the public endpoints.
- **`/ratings` is an async job** — StatsPlus generates the export in
  60-90 seconds. The desktop app starts the job, polls until it's done,
  and requires being signed in and linked to a team in the league. It's
  triggered manually from the Players tab ("Pull ratings") and cached
  like everything else, so it doesn't need to be re-run every session.
- **`playerbatstatsv2`/`playerpitchstatsv2` are cached per season**
  (`playerbatstatsv2:2052`, etc.), so multiple years can be pulled or
  imported without one overwriting another. The Players tab has a season
  dropdown once more than one year is cached.
- **These endpoints (and likely teambatstats/teampitchstats) return one
  row per player/team PER SPLIT** (season total, vs LHP/RHP, home/away,
  ...), confirmed from real data — `split_id === 1` is the season
  "Total" split. The app filters to that split everywhere automatically
  (`filterSeasonTotals` in `src/api/statsplus.js`); endpoints without a
  `split_id` column pass through unfiltered.
- Real `playerpitchstatsv2`/`playerbatstatsv2` columns don't include
  `era`/`whip`/`avg`/`obp`/`slg`/`ops` — they're computed
  (`withPitchingRates`/`withBattingRates` in `src/lib/players.js`)
  whenever the raw columns aren't present.

Rate-limited? Every card and the league detail view have a **📋 Import
manually** button: open the endpoint URL yourself (a plain browser
request isn't subject to this app's request queue), copy the response,
and paste it in — it's parsed and cached exactly like a pull. Useful for
backfilling several seasons of stats at once, since nothing stops you
from opening `.../playerbatstatsv2/?year=2048` through `?year=2052` one
at a time in your own browser and importing each.

StatsPlus rate-limits aggressively — all requests go through a queue that
spaces them out, but repeated manual testing can still trigger a 429 that
takes a few minutes to clear.

## Setup

### 1. Desktop app (Windows & macOS)

Installers are built by GitHub Actions (`.github/workflows/desktop.yml`):

- **Manual build**: Actions → "Desktop builds" → Run workflow. Download
  the `.exe` (Windows) or `.dmg` (macOS) from the run's artifacts.
- **Release build**: push a tag like `v0.1.0` and the installers are
  attached to a GitHub Release automatically.

The macOS build is unsigned (no Apple Developer account needed): the first
time, right-click the app → **Open** → Open, or run
`xattr -cr "/Applications/OOTP Dashboard.app"`.

**Build number**: every CI build stamps the app with a version of
`0.1.<GitHub Actions run number>` plus the short commit it built from —
shown in the app header (e.g. "v0.1.42 · a1b2c3d") and baked into the
installer's filename, so you can always tell which build is installed.
Local `npm run desktop`/`desktop:pack` builds show "dev build" instead,
since that stamping only happens in CI.

**Upgrades replace, not stack**: the installer's app ID stays constant
across builds, so running a newer installer over an existing install
replaces it in place — no duplicate Start Menu entries or side-by-side
versions.

Local development / packaging:

```sh
npm run desktop        # build the UI and launch Electron
npm run desktop:pack   # build an installer for the current OS into release/
```

### 2. Vercel (web app, optional)

Import the repo; the Vite preset works as-is and `api/proxy.js` is picked
up automatically as a serverless function. No environment variables are
needed.

Note: `api/package.json` contains `{ "type": "commonjs" }` — required
because the root `package.json` sets `"type": "module"` for Vite, but the
serverless function is written in CommonJS. Don't delete it.

### 3. Local development (web)

```sh
npm install
npm run dev
```

The Vite dev server includes a middleware (in `vite.config.js`) that mimics
`api/proxy.js`, so `/api/proxy` works locally without `vercel dev`.

## Adding a league

1. Click **+ Add League**.
2. Paste the league's StatsPlus URL (or just the slug) and hit **Test** —
   green means the proxy reached the league's API.
3. Enter your team ID — the modal links to the league's `/api/teams`
   endpoint so you can look it up.
4. Save. The card appears with a **⬇ Pull data** button — click it to
   fetch from StatsPlus for the first time.
