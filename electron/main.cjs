// Electron main process. CommonJS (.cjs) because the root package.json is
// "type": "module" for the Vite app.
const { app, BrowserWindow, ipcMain, shell, net } = require('electron');
const path = require('path');
const fs = require('fs/promises');

// Endpoints per https://wiki.statsplus.net/web-tools/statsplus-api. The
// desktop app talks to StatsPlus directly from the main process; requests
// carry the user's StatsPlus login cookies (credentials: 'include'), so
// endpoints that require being signed in work after using the in-app
// "Sign in to StatsPlus" window.
const ALLOWED_ENDPOINTS = new Set([
  'date',
  'exports',
  'lgdata',
  'teams',
  'teambatstats',
  'teampitchstats',
  'players',
  'playerbatstatsv2',
  'playerpitchstatsv2',
  'playerfieldstatsv2',
  'gamehistory',
  'ratings',
]);
const ALLOWED_PARAMS = ['year', 'split', 'pid', 'lid'];
const LGURL_RE = /^[a-zA-Z0-9_-]+$/;

const jsonError = (status, error, extra = {}) => ({
  ok: false,
  status,
  body: JSON.stringify({ error, ...extra }),
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// net.fetch goes through Chromium's network stack; credentials: 'include'
// attaches the StatsPlus session cookies from the in-app login.
async function statsplusFetch(url) {
  const res = await net.fetch(url, { credentials: 'include' });
  const text = await res.text();
  return { res, text };
}

ipcMain.handle(
  'statsplus-fetch',
  async (_event, { lgurl, endpoint, params } = {}) => {
    if (!lgurl || !LGURL_RE.test(lgurl)) {
      return jsonError(400, 'Invalid or missing lgurl');
    }
    if (!endpoint || !ALLOWED_ENDPOINTS.has(endpoint)) {
      return jsonError(400, 'Invalid or missing endpoint');
    }

    const url = new URL(`https://statsplus.net/${lgurl}/api/${endpoint}/`);
    for (const key of ALLOWED_PARAMS) {
      if (params && params[key] !== undefined && params[key] !== '') {
        url.searchParams.set(key, String(params[key]));
      }
    }

    let res;
    let text;
    try {
      ({ res, text } = await statsplusFetch(url));
    } catch (err) {
      return jsonError(502, `Request failed: ${err.message}`);
    }

    if (res.status === 429) {
      return jsonError(
        429,
        'StatsPlus rate limit hit. Wait before pulling more data.',
        { retryAfter: res.headers.get('Retry-After') }
      );
    }
    if (!res.ok) {
      return jsonError(res.status, `StatsPlus returned ${res.status}`);
    }
    return { ok: true, status: 200, body: text };
  }
);

// Opens a real browser window on statsplus.net so the user can sign in.
// The session cookies persist in the app's user-data folder and are then
// attached to every API request.
ipcMain.handle('statsplus-login', async () => {
  const win = new BrowserWindow({
    width: 980,
    height: 800,
    title: 'Sign in to StatsPlus',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  win.loadURL('https://statsplus.net/');
  await new Promise((resolve) => win.on('closed', resolve));
  return { ok: true };
});

// The /ratings endpoint is an async job: the first request returns text
// containing a poll URL; the CSV is ready after ~60-90 seconds. Requires
// being signed in to StatsPlus and linked to a team in the league.
ipcMain.handle('statsplus-ratings', async (_event, { lgurl } = {}) => {
  if (!lgurl || !LGURL_RE.test(lgurl)) {
    return jsonError(400, 'Invalid or missing lgurl');
  }

  let text;
  try {
    ({ text } = await statsplusFetch(`https://statsplus.net/${lgurl}/api/ratings/`));
  } catch (err) {
    return jsonError(502, `Request failed: ${err.message}`);
  }

  const wait = text.match(/wait (\d+) seconds/i);
  if (wait) {
    return jsonError(429, `StatsPlus rate limit — wait ${wait[1]} seconds and try again.`);
  }

  // Some hosts may return the CSV directly.
  if (text.includes(',') && text.includes('\n') && !/https?:\/\//.test(text.slice(0, 200))) {
    return { ok: true, status: 200, body: text };
  }

  const pollMatch = text.match(/https?:\/\/[^\s"']*\?request=[^\s"']+/);
  if (!pollMatch) {
    return jsonError(
      403,
      'Ratings job did not start. Make sure you are signed in to StatsPlus ' +
        '(button in the app header) and your account is linked to a team in this league.'
    );
  }

  for (let attempt = 0; attempt < 24; attempt++) {
    await sleep(10_000);
    let pollText;
    try {
      ({ text: pollText } = await statsplusFetch(pollMatch[0]));
    } catch {
      continue;
    }
    if (
      pollText.includes('still in progress') ||
      pollText.startsWith('Request received')
    ) {
      continue;
    }
    return { ok: true, status: 200, body: pollText };
  }
  return jsonError(504, 'Ratings job timed out after 4 minutes. Try again.');
});

// League configs live in a JSON file in the app's per-user data folder
// (Windows: %APPDATA%\OOTP Dashboard, macOS: ~/Library/Application
// Support/OOTP Dashboard).
const leaguesFile = () => path.join(app.getPath('userData'), 'leagues.json');

// Pulled StatsPlus data is cached to disk, one file per league, in the
// same per-user data folder's "data" subdirectory. The app always reads
// from this file; the network is only touched when the user clicks a
// "Pull data" button, which then overwrites the relevant entries here.
const sanitizeId = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
const dataFile = (leagueId) =>
  path.join(app.getPath('userData'), 'data', `${sanitizeId(leagueId)}.json`);

ipcMain.handle('data-load-all', async (_event, leagueId) => {
  try {
    return JSON.parse(await fs.readFile(dataFile(leagueId), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
});

ipcMain.handle('data-save', async (_event, { leagueId, endpoint, data, rawText }) => {
  const file = dataFile(leagueId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  let all = {};
  try {
    all = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  all[endpoint] = { fetchedAt: Date.now(), data, rawText };
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(all, null, 2));
  await fs.rename(tmp, file);
});

ipcMain.handle('data-clear', async (_event, leagueId) => {
  try {
    await fs.unlink(dataFile(leagueId));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
});

ipcMain.handle('leagues-load', async () => {
  try {
    return JSON.parse(await fs.readFile(leaguesFile(), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
});

ipcMain.handle('leagues-save', async (_event, leagues) => {
  const file = leaguesFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Write to a temp file and rename so a crash mid-write can't corrupt
  // the league list.
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(leagues || {}, null, 2));
  await fs.rename(tmp, file);
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 840,
    title: 'OOTP Dashboard',
    backgroundColor: '#111827',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // External links (e.g. the /api/teams helper) open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
