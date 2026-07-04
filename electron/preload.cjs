const { contextBridge, ipcRenderer } = require('electron');

// The renderer detects desktop mode by the presence of this bridge and
// routes StatsPlus requests through the main process instead of /api/proxy.
contextBridge.exposeInMainWorld('statsplusDesktop', {
  fetch: (params) => ipcRenderer.invoke('statsplus-fetch', params),
});

// League configs are stored in a JSON file on this computer (the app's
// per-user data folder); the web version falls back to localStorage.
contextBridge.exposeInMainWorld('leagueStore', {
  load: () => ipcRenderer.invoke('leagues-load'),
  save: (leagues) => ipcRenderer.invoke('leagues-save', leagues),
});
