const { contextBridge, ipcRenderer } = require('electron');

// The renderer detects desktop mode by the presence of this bridge and
// routes StatsPlus requests through the main process instead of /api/proxy.
contextBridge.exposeInMainWorld('statsplusDesktop', {
  fetch: (params) => ipcRenderer.invoke('statsplus-fetch', params),
});
