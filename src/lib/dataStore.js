// Cache for data pulled from StatsPlus.
//
// Dataflow: the user pulls data with an explicit action, the pull fetches
// from the StatsPlus API and writes the result here, and every view in the
// app renders from this cache — never from a live in-memory fetch. On
// desktop this cache is a JSON file per league in the app's per-user data
// folder; on web it's localStorage.
//
// Shape per league: { [endpoint]: { fetchedAt: <ms>, data: <parsed JSON> } }

const bridge = typeof window !== 'undefined' ? window.localData : undefined;

const lsPrefix = (leagueId) => `ootp-dashboard-data-${leagueId}-`;

export async function loadAllCached(leagueId) {
  if (bridge) return (await bridge.loadAll(leagueId)) || {};
  const prefix = lsPrefix(leagueId);
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    try {
      out[key.slice(prefix.length)] = JSON.parse(localStorage.getItem(key));
    } catch {
      /* skip corrupt cache entry */
    }
  }
  return out;
}

export async function saveCached(leagueId, endpoint, data) {
  const entry = { fetchedAt: Date.now(), data };
  if (bridge) {
    await bridge.save(leagueId, endpoint, data);
  } else {
    localStorage.setItem(lsPrefix(leagueId) + endpoint, JSON.stringify(entry));
  }
  return entry;
}

export async function clearCached(leagueId) {
  if (bridge) {
    await bridge.clear(leagueId);
    return;
  }
  const prefix = lsPrefix(leagueId);
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) localStorage.removeItem(key);
  }
}
