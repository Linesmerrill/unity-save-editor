const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e'
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle file read
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    return { success: true, data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Handle file save
ipcMain.handle('save-file', async (event, { originalPath, data }) => {
  try {
    const defaultPath = originalPath
      ? originalPath.replace('.dat', '_modified.dat')
      : 'modified_save.dat';

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Modified File',
      defaultPath: defaultPath,
      filters: [
        { name: 'DAT Files', extensions: ['dat'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled) return { success: false, canceled: true };

    fs.writeFileSync(result.filePath, Buffer.from(data));
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Handle loading custom names
ipcMain.handle('load-names', async () => {
  const namesPath = path.join(app.getPath('userData'), 'item-names.json');
  try {
    if (fs.existsSync(namesPath)) {
      const data = fs.readFileSync(namesPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading names:', err);
  }
  return {};
});

// Handle saving custom names
ipcMain.handle('save-names', async (event, names) => {
  const namesPath = path.join(app.getPath('userData'), 'item-names.json');
  try {
    fs.writeFileSync(namesPath, JSON.stringify(names, null, 2));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
