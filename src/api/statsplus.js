// StatsPlus client. In the browser, requests go through the serverless
// proxy (/api/proxy) because StatsPlus doesn't send CORS headers. In the
// Electron desktop app, the preload bridge routes them through the main
// process, which can call StatsPlus directly.

const desktopBridge =
  typeof window !== 'undefined' ? window.statsplusDesktop : undefined;

// Global request queue: every StatsPlus call across the app is spaced out
// to avoid tripping the aggressive StatsPlus rate limiter with bursts.
const REQUEST_GAP_MS = 350;
let lastRequestAt = 0;
let queueChain = Promise.resolve();

function queued(fn) {
  const run = async () => {
    const wait = Math.max(0, lastRequestAt + REQUEST_GAP_MS - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await fn();
    } finally {
      lastRequestAt = Date.now();
    }
  };
  const p = queueChain.then(run, run);
  queueChain = p.then(
    () => {},
    () => {}
  );
  return p;
}

async function request(league, endpoint) {
  if (desktopBridge) {
    const { ok, status, body } = await desktopBridge.fetch({
      lgurl: league.lgurl,
      endpoint,
      token: league.token || '',
    });
    return { ok, status, text: body };
  }
  const params = new URLSearchParams({ lgurl: league.lgurl, endpoint });
  if (league.token) params.set('token', league.token);
  const res = await fetch(`/api/proxy?${params}`);
  return { ok: res.ok, status: res.status, text: await res.text() };
}

export async function fetchEndpoint(league, endpoint) {
  const { ok, status, text } = await queued(() => request(league, endpoint));

  if (!ok) {
    let message = `Request failed (${status})`;
    try {
      const body = JSON.parse(text);
      if (body.error) message = body.error;
    } catch {
      /* non-JSON error body; keep generic message */
    }
    const err = new Error(message);
    err.status = status;
    throw err;
  }

  try {
    return JSON.parse(text);
  } catch {
    return parseCsv(text);
  }
}

// Minimal CSV parser for StatsPlus CSV endpoints (no quoted commas observed
// in their output, so a simple split is sufficient).
export function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] !== undefined ? cells[i].trim() : '';
    });
    return row;
  });
}

// --- Tolerant helpers: StatsPlus field names vary by league/endpoint ---

function firstField(obj, names) {
  for (const n of names) {
    if (obj && obj[n] !== undefined && obj[n] !== null && obj[n] !== '') {
      return obj[n];
    }
  }
  return undefined;
}

function asRows(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return Object.values(data);
  return [];
}

export function extractSimDate(data) {
  if (typeof data === 'string') return data;
  if (Array.isArray(data) && data.length > 0) return extractSimDate(data[0]);
  if (data && typeof data === 'object') {
    return firstField(data, ['date', 'Date', 'current_date', 'game_date', 'simdate']);
  }
  return undefined;
}

export function findTeamRow(data, teamId) {
  const rows = asRows(data);
  const wanted = String(teamId);
  return rows.find((row) => {
    const id = firstField(row, ['team_id', 'teamid', 'id', 'ID', 'TeamID', 'tid']);
    return id !== undefined && String(id) === wanted;
  });
}

export function extractRecord(teamRow) {
  if (!teamRow) return undefined;
  const w = firstField(teamRow, ['w', 'W', 'wins', 'Wins']);
  const l = firstField(teamRow, ['l', 'L', 'losses', 'Losses']);
  if (w === undefined || l === undefined) return undefined;
  return `${w}-${l}`;
}

export function extractTeamName(teamRow) {
  if (!teamRow) return undefined;
  const name = firstField(teamRow, ['name', 'Name', 'team_name', 'nickname']);
  const abbr = firstField(teamRow, ['abbr', 'Abbr', 'abbrev', 'abbreviation']);
  return name || abbr;
}

export function extractExportStatus(data, teamId) {
  const row = findTeamRow(data, teamId);
  if (!row) return undefined;
  const exported = firstField(row, [
    'exported',
    'export',
    'last_export',
    'lastexport',
    'export_date',
    'exportdate',
    'date',
  ]);
  return { row, exported };
}
