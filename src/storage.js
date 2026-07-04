// League storage.
// Desktop: JSON file in the app's per-user data folder, via the preload
// bridge (Windows: %APPDATA%\OOTP Dashboard\leagues.json, macOS:
// ~/Library/Application Support/OOTP Dashboard/leagues.json).
// Web / dev server: browser localStorage.

const KEY = 'ootp-dashboard-leagues';

const bridge = typeof window !== 'undefined' ? window.leagueStore : undefined;

export async function loadLeagues() {
  if (bridge) {
    return (await bridge.load()) || {};
  }
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

export async function saveLeagues(leagues) {
  if (bridge) {
    await bridge.save(leagues);
    return;
  }
  localStorage.setItem(KEY, JSON.stringify(leagues));
}
