// Electron main process. CommonJS (.cjs) because the root package.json is
// "type": "module" for the Vite app.
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');

// Same request rules as api/proxy.js — the desktop app talks to StatsPlus
// directly from the main process, so no CORS proxy is needed.
const ALLOWED_ENDPOINTS = new Set([
  'date',
  'exports',
  'lgdata',
  'teams',
  'teambatstats',
  'teampitchstats',
  'players',
  'batstats',
  'pitchstats',
  'standings',
  'ratings',
  'tradeblock',
]);
const LGURL_RE = /^[a-zA-Z0-9_-]+$/;

const jsonError = (status, error) => ({
  ok: false,
  status,
  body: JSON.stringify({ error }),
});

ipcMain.handle('statsplus-fetch', async (_event, { lgurl, endpoint, token } = {}) => {
  if (!lgurl || !LGURL_RE.test(lgurl)) {
    return jsonError(400, 'Invalid or missing lgurl');
  }
  if (!endpoint || !ALLOWED_ENDPOINTS.has(endpoint)) {
    return jsonError(400, 'Invalid or missing endpoint');
  }

  const url = new URL(`https://statsplus.net/${lgurl}/api/${endpoint}`);
  if (token) url.searchParams.set('token', token);

  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'ootp-dashboard-desktop' },
    });
  } catch (err) {
    return jsonError(502, `Request failed: ${err.message}`);
  }

  const text = await res.text();
  if (res.status === 429) {
    return jsonError(429, 'StatsPlus rate limit hit. Wait a few minutes and try again.');
  }
  if (!res.ok) {
    return jsonError(res.status, `StatsPlus returned ${res.status}`);
  }
  return { ok: true, status: 200, body: text };
});

// League configs live in a JSON file in the app's per-user data folder
// (Windows: %APPDATA%\OOTP Dashboard, macOS: ~/Library/Application
// Support/OOTP Dashboard).
const leaguesFile = () => path.join(app.getPath('userData'), 'leagues.json');

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
