const { contextBridge, ipcRenderer } = require('electron');

// The renderer detects desktop mode by the presence of this bridge and
// routes StatsPlus requests through the main process instead of /api/proxy.
contextBridge.exposeInMainWorld('statsplusDesktop', {
  fetch: (params) => ipcRenderer.invoke('statsplus-fetch', params),
  login: () => ipcRenderer.invoke('statsplus-login'),
  ratings: (params) => ipcRenderer.invoke('statsplus-ratings', params),
});

// League configs are stored in a JSON file on this computer (the app's
// per-user data folder); the web version falls back to localStorage.
contextBridge.exposeInMainWorld('leagueStore', {
  load: () => ipcRenderer.invoke('leagues-load'),
  save: (leagues) => ipcRenderer.invoke('leagues-save', leagues),
});

// Pulled StatsPlus data is cached to a JSON file per league on this
// computer. The app renders from this cache; a "Pull data" action fetches
// from StatsPlus and writes the result here.
contextBridge.exposeInMainWorld('localData', {
  loadAll: (leagueId) => ipcRenderer.invoke('data-load-all', leagueId),
  save: (leagueId, endpoint, data, rawText) =>
    ipcRenderer.invoke('data-save', { leagueId, endpoint, data, rawText }),
  clear: (leagueId) => ipcRenderer.invoke('data-clear', leagueId),
});
