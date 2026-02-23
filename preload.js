const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  saveFile: (data) => ipcRenderer.invoke('save-file', data),
  loadNames: () => ipcRenderer.invoke('load-names'),
  saveNames: (names) => ipcRenderer.invoke('save-names', names)
});
