// Player data merging + ratings analysis.
//
// StatsPlus field names vary by league and endpoint, so everything here
// works by pattern-matching keys instead of hardcoding them, and rating
// scales (20-80, 1-100, 1-250, stars…) are inferred from the league-wide
// max of each column.

import { filterSeasonTotals } from '../api/statsplus';

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function asRows(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return Object.values(data);
  return [];
}

// Find the first key of `row` that matches one of `patterns`, trying
// patterns in priority order (not row-key order) — e.g. StatsPlus stat
// rows have both a generic "id" (the stat record's own id) and
// "player_id" columns, and ID_PATTERNS lists player_id first precisely
// so it wins even though "id" often appears earlier in the row. Keys
// containing "pot" are potential ratings; `mode` selects which side.
function matchKey(row, patterns, mode = 'current') {
  for (const re of patterns) {
    for (const key of Object.keys(row)) {
      const k = key.toLowerCase();
      const isPot = k.includes('pot');
      if (mode === 'current' && isPot) continue;
      if (mode === 'potential' && !isPot) continue;
      if (re.test(k)) return key;
    }
  }
  return null;
}

const ID_PATTERNS = [/^player_?id$/, /^pid$/, /^id$/];
const NAME_PATTERNS = [/^(player_?)?name$/, /^full_?name$/];
const TEAM_PATTERNS = [/^team_?id$/, /^tid$/, /^team$/];
const POS_PATTERNS = [/^pos(ition)?$/, /^position_?id$/];
const AGE_PATTERNS = [/^age$/];

const POSITION_CODES = {
  1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B',
  6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF', 10: 'DH', 11: 'P',
};

// Same priority-order fix as matchKey above — see its comment.
function firstMatchValue(row, patterns) {
  for (const re of patterns) {
    for (const key of Object.keys(row)) {
      if (re.test(key.toLowerCase())) return row[key];
    }
  }
  return undefined;
}

export function playerIdOf(row) {
  const v = firstMatchValue(row, ID_PATTERNS);
  return v === undefined || v === null || v === '' ? null : String(v);
}

export function playerNameOf(row) {
  const name = firstMatchValue(row, NAME_PATTERNS);
  if (name) return String(name);
  const first = firstMatchValue(row, [/^first_?name$/, /^fname$/]);
  const last = firstMatchValue(row, [/^last_?name$/, /^lname$/]);
  if (first || last) return [first, last].filter(Boolean).join(' ');
  return null;
}

export function positionOf(row) {
  const v = firstMatchValue(row, POS_PATTERNS);
  if (v === undefined || v === null || v === '') return null;
  const n = num(v);
  if (n !== null && POSITION_CODES[n]) return POSITION_CODES[n];
  return String(v).toUpperCase();
}

export function teamIdOf(row) {
  const v = firstMatchValue(row, TEAM_PATTERNS);
  return v === undefined || v === null || v === '' ? null : String(v);
}

export function ageOf(row) {
  return num(firstMatchValue(row, AGE_PATTERNS));
}

// Merge the per-player endpoints into one record per player id.
export function buildPlayerIndex({ players, batstats, pitchstats, ratings }) {
  const map = new Map();
  const ensure = (id) => {
    if (!map.has(id)) {
      map.set(id, { id, info: null, bat: null, pitch: null, rating: null });
    }
    return map.get(id);
  };

  for (const row of asRows(players)) {
    const id = playerIdOf(row);
    if (id) ensure(id).info = row;
  }
  // playerbatstatsv2/playerpitchstatsv2 return one row per player PER
  // SPLIT (season total, vs LHP/RHP, home/away, ...) — keep only the
  // "Total" split (split_id === 1), confirmed against real data.
  for (const row of filterSeasonTotals(asRows(batstats))) {
    const id = playerIdOf(row);
    if (id) ensure(id).bat = row;
  }
  for (const row of filterSeasonTotals(asRows(pitchstats))) {
    const id = playerIdOf(row);
    if (id) ensure(id).pitch = row;
  }
  for (const row of asRows(ratings)) {
    const id = playerIdOf(row);
    if (id) ensure(id).rating = row;
  }

  const list = [];
  for (const p of map.values()) {
    const source = p.info || p.rating || p.bat || p.pitch;
    const name = [p.info, p.rating, p.bat, p.pitch]
      .map((r) => r && playerNameOf(r))
      .find(Boolean);
    if (!name) continue;
    list.push({
      ...p,
      name,
      position: [p.info, p.rating, p.bat, p.pitch]
        .map((r) => r && positionOf(r))
        .find(Boolean),
      teamId: [p.info, p.rating, p.bat, p.pitch]
        .map((r) => r && teamIdOf(r))
        .find(Boolean),
      age: [p.info, p.rating].map((r) => r && ageOf(r)).find((v) => v != null),
      isPitcher: false, // filled below
      _source: source,
    });
  }
  for (const p of list) {
    p.isPitcher =
      p.position === 'P' ||
      (p.pitch != null && p.bat == null) ||
      (p.rating != null && matchKey(p.rating, [/stuff/]) != null);
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

// --- Tool/rating radar extraction ---

export const BATTING_TOOLS = [
  { label: 'Contact', patterns: [/contact/, /^con$/] },
  { label: 'Gap', patterns: [/gap/] },
  { label: 'Power', patterns: [/^pow(er)?($|_)/, /power/] },
  { label: 'Eye', patterns: [/eye/, /disc/] },
  { label: 'Avoid K', patterns: [/avoid/, /^strikeouts?$/, /^ks?$/] },
];

export const PITCHING_TOOLS = [
  { label: 'Stuff', patterns: [/stuff/] },
  { label: 'Movement', patterns: [/move?ment/, /^mov$/, /^move$/] },
  { label: 'Control', patterns: [/control/, /^ctl$/] },
  { label: 'Stamina', patterns: [/stamina/, /^stm$/] },
  { label: 'Hold Runners', patterns: [/hold/] },
];

export const DEFENSE_TOOLS = [
  { label: 'Speed', patterns: [/^speed$/, /^spe$/, /run_?speed/] },
  { label: 'Stealing', patterns: [/steal/] },
  { label: 'Baserunning', patterns: [/baserun/, /^br$/] },
  { label: 'Range', patterns: [/range/] },
  { label: 'Error', patterns: [/error/] },
  { label: 'Arm', patterns: [/arm/] },
  { label: 'Turn DP', patterns: [/dp$/, /double_?play/] },
];

// Infer the rating scale from the biggest value seen league-wide.
function inferScale(max) {
  if (max == null) return 100;
  for (const s of [5, 10, 20, 80, 100, 250]) {
    if (max <= s) return s;
  }
  return max;
}

// Build radar axes for one player. `allRows` (league-wide ratings) is used
// to infer each column's scale. Returns [] when fewer than 3 tools match.
export function buildToolAxes(ratingRow, allRows, tools) {
  if (!ratingRow) return [];
  const axes = [];
  for (const tool of tools) {
    const curKey = matchKey(ratingRow, tool.patterns, 'current');
    if (!curKey) continue;
    const cur = num(ratingRow[curKey]);
    if (cur === null) continue;

    let max = null;
    for (const row of allRows) {
      const v = num(row[curKey]);
      if (v !== null && (max === null || v > max)) max = v;
    }
    const scale = inferScale(max);

    const potKey = matchKey(ratingRow, tool.patterns, 'potential');
    const pot = potKey ? num(ratingRow[potKey]) : null;

    axes.push({
      label: tool.label,
      value: Math.min(100, (cur / scale) * 100),
      potential: pot === null ? null : Math.min(100, (pot / scale) * 100),
      raw: cur,
      rawPot: pot,
      scale,
    });
  }
  return axes.length >= 3 ? axes : [];
}

// Composite 20-80 scouting score from a set of axes (mean of 0-100 values).
export function compositeScore(axes, key = 'value') {
  const vals = axes.map((a) => a[key]).filter((v) => v != null);
  if (vals.length === 0) return null;
  const pct = vals.reduce((s, v) => s + v, 0) / vals.length;
  return Math.round(20 + (pct / 100) * 60);
}

// StatsPlus's real playerpitchstatsv2/teampitchstats columns (confirmed
// from live data) don't include era/whip — compute them from
// er/ip/bb/ha when they're missing, so the stat line still shows the
// rate stats people actually look for.
export function withPitchingRates(row) {
  if (!row) return row;
  const lower = {};
  for (const k of Object.keys(row)) lower[k.toLowerCase()] = k;
  const get = (name) => (lower[name] !== undefined ? Number(row[lower[name]]) : NaN);
  const ip = get('ip');
  if (!Number.isFinite(ip) || ip <= 0) return row;

  const out = { ...row };
  if (lower.era === undefined) {
    const er = get('er');
    if (Number.isFinite(er)) out.era = ((er * 9) / ip).toFixed(2);
  }
  if (lower.whip === undefined) {
    const bb = get('bb');
    const ha = get('ha');
    if (Number.isFinite(bb) && Number.isFinite(ha)) {
      out.whip = ((bb + ha) / ip).toFixed(2);
    }
  }
  return out;
}

// Format a batting rate the traditional way: ".300", not "0.300" — but
// keep the leading digit for anything >= 1 (some OPS values are).
function fmtRate3(n) {
  if (!Number.isFinite(n)) return undefined;
  const s = n.toFixed(3);
  return n < 1 ? s.replace(/^0/, '') : s;
}

// Real playerbatstatsv2/teambatstats columns (confirmed from live data)
// don't include avg/obp/slg/ops either — compute them from
// ab/h/d/t/hr/bb/hp/sf when they're missing.
export function withBattingRates(row) {
  if (!row) return row;
  const lower = {};
  for (const k of Object.keys(row)) lower[k.toLowerCase()] = k;
  const get = (name) => (lower[name] !== undefined ? Number(row[lower[name]]) : NaN);
  const orZero = (n) => (Number.isFinite(n) ? n : 0);

  const ab = get('ab');
  if (!Number.isFinite(ab) || ab <= 0) return row;

  const h = get('h');
  const d = orZero(get('d'));
  const t = orZero(get('t'));
  const hr = orZero(get('hr'));
  const bb = orZero(get('bb'));
  const hp = orZero(get('hp'));
  const sf = orZero(get('sf'));

  let avgNum, slgNum, obpNum;
  if (Number.isFinite(h)) {
    avgNum = h / ab;
    slgNum = (h + d + 2 * t + 3 * hr) / ab;
    const obpDenom = ab + bb + hp + sf;
    if (obpDenom > 0) obpNum = (h + bb + hp) / obpDenom;
  }

  const out = { ...row };
  if (lower.avg === undefined && avgNum !== undefined) out.avg = fmtRate3(avgNum);
  if (lower.obp === undefined && obpNum !== undefined) out.obp = fmtRate3(obpNum);
  if (lower.slg === undefined && slgNum !== undefined) out.slg = fmtRate3(slgNum);
  if (lower.ops === undefined && obpNum !== undefined && slgNum !== undefined) {
    out.ops = fmtRate3(obpNum + slgNum);
  }
  return out;
}

// A couple of raw column names read confusingly as a bare uppercase
// label (e.g. StatsPlus uses "s" for saves, not "sv").
const STAT_LABEL_OVERRIDES = { s: 'SV' };

// Numeric stat picking for the player stat line (reuses the tolerant
// approach from the team cards).
export function pickPlayerStats(row, preferredKeys) {
  if (!row) return [];
  const lower = {};
  for (const [k, v] of Object.entries(row)) lower[k.toLowerCase()] = v;
  const label = (k) => STAT_LABEL_OVERRIDES[k] || k.toUpperCase();
  const picked = preferredKeys
    .filter((k) => lower[k] !== undefined && lower[k] !== '')
    .map((k) => [label(k), lower[k]]);
  if (picked.length > 0) return picked;
  return Object.entries(row)
    .filter(([, v]) => v !== '' && !Number.isNaN(Number(v)))
    .slice(0, 10)
    .map(([k, v]) => [label(k.toLowerCase()), v]);
}

export const BAT_STAT_KEYS = ['g', 'ab', 'r', 'h', 'hr', 'rbi', 'sb', 'bb', 'k', 'avg', 'obp', 'slg', 'ops'];
export const PITCH_STAT_KEYS = ['g', 'gs', 'w', 'l', 's', 'ip', 'ha', 'er', 'bb', 'k', 'era', 'whip'];
