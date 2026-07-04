# OOTP League Dashboard

Personal GM dashboard for OOTP Online leagues hosted on
[StatsPlus](https://statsplus.net). Shows sim date, export status, W-L
record, and team batting/pitching stats for each of your leagues, with data
refreshed automatically every 10 minutes.

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

League configs are stored locally on each computer — no cloud database:

- **Desktop app**: a `leagues.json` file in the app's per-user data folder
  - Windows: `%APPDATA%\OOTP Dashboard\leagues.json`
  - macOS: `~/Library/Application Support/OOTP Dashboard/leagues.json`
- **Web app / dev server**: browser localStorage

Each computer keeps its own league list, so a league added on one machine
has to be added on the other too. The `leagues.json` file can be copied
between machines to transfer the list.

## StatsPlus API

Requests follow the pattern `https://statsplus.net/{lgurl}/api/{endpoint}`.
Endpoints used: `date`, `exports`, `lgdata`, `teams`, `teambatstats`,
`teampitchstats`. Responses are JSON or CSV; the client handles both.

StatsPlus rate-limits aggressively — the proxy caches responses at the edge
for 60 seconds and the client staggers its requests, but repeated manual
testing can still trigger a 429 that takes ~5–10 minutes to clear.

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
4. Add the API token if the league requires one, then save. The card
   appears immediately and starts loading data.
