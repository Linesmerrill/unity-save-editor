const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  parseFile: (filePath) => ipcRenderer.invoke('parse-file', filePath),
  parseBuffer: (data) => ipcRenderer.invoke('parse-buffer', data),
  saveFile: (data) => ipcRenderer.invoke('save-file', data),
  loadNames: () => ipcRenderer.invoke('load-names'),
  saveNames: (names) => ipcRenderer.invoke('save-names', names),
  loadRecents: () => ipcRenderer.invoke('load-recents'),
  removeRecent: (filePath) => ipcRenderer.invoke('remove-recent', filePath),
  clearRecents: () => ipcRenderer.invoke('clear-recents'),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});
