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

async function request(league, endpoint, extraParams = {}) {
  if (desktopBridge) {
    const { ok, status, body } = await desktopBridge.fetch({
      lgurl: league.lgurl,
      endpoint,
      params: extraParams,
    });
    return { ok, status, text: body };
  }
  const params = new URLSearchParams({ lgurl: league.lgurl, endpoint });
  for (const [key, value] of Object.entries(extraParams)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const res = await fetch(`/api/proxy?${params}`);
  return { ok: res.ok, status: res.status, text: await res.text() };
}

// StatsPlus responses are JSON for most endpoints, CSV for others (see
// https://wiki.statsplus.net/web-tools/statsplus-api). Try JSON first,
// fall back to CSV — used both for live fetches and for manually pasted
// responses (see src/lib/dataStore.js manual import).
export function parseResponseText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return parseCsv(text);
  }
}

export async function fetchEndpoint(league, endpoint, extraParams = {}) {
  const { ok, status, text } = await queued(() =>
    request(league, endpoint, extraParams)
  );

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

  return parseResponseText(text);
}

// CSV parser for StatsPlus CSV endpoints. Handles quoted fields (player
// names can contain commas) and escaped quotes ("" -> ").
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    if (row.length > 1 || row[0].trim() !== '') rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      pushRow();
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) pushRow();

  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = cells[i] !== undefined ? cells[i].trim() : '';
    });
    return obj;
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

// Season year from the /date response, e.g. "2027-05-01" -> 2027. Used
// as the `year` param for the player stat endpoints.
export function extractYear(data) {
  const date = extractSimDate(data);
  if (!date) return null;
  const m = String(date).match(/\d{4}/);
  return m ? Number(m[0]) : null;
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
