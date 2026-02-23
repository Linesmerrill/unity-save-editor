const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { UnitySaveParser } = require('./src/parser.js');

let mainWindow;
let currentFileBuffer = null;
let currentFilePath = null;
let currentFileName = null;
let currentItemCount = 0;

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
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
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

// Recent files helpers
function getRecentsPath() {
  return path.join(app.getPath('userData'), 'recent-files.json');
}

function loadRecentFiles() {
  try {
    const p = getRecentsPath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      return data.filter(entry => fs.existsSync(entry.path));
    }
  } catch (err) {
    console.error('Error loading recents:', err);
  }
  return [];
}

function addRecentFile(filePath, itemCount) {
  let recents = loadRecentFiles();
  recents = recents.filter(r => r.path !== filePath);
  let fileSize = 0;
  try { fileSize = fs.statSync(filePath).size; } catch (e) {}
  recents.unshift({
    path: filePath,
    name: path.basename(filePath),
    dir: path.dirname(filePath),
    itemCount: itemCount,
    fileSize: fileSize,
    lastOpened: new Date().toISOString()
  });
  recents = recents.slice(0, 10);
  try {
    fs.writeFileSync(getRecentsPath(), JSON.stringify(recents, null, 2));
  } catch (err) {
    console.error('Error saving recents:', err);
  }
}

// Load recent files list
ipcMain.handle('load-recents', async () => {
  return loadRecentFiles();
});

// Remove a single recent file entry
ipcMain.handle('remove-recent', async (event, filePath) => {
  let recents = loadRecentFiles();
  recents = recents.filter(r => r.path !== filePath);
  try {
    fs.writeFileSync(getRecentsPath(), JSON.stringify(recents, null, 2));
  } catch (err) {
    console.error('Error saving recents:', err);
  }
  return { success: true };
});

// Clear all recent files
ipcMain.handle('clear-recents', async () => {
  try {
    fs.writeFileSync(getRecentsPath(), JSON.stringify([], null, 2));
  } catch (err) {
    console.error('Error clearing recents:', err);
  }
  return { success: true };
});

// Open file dialog — start in ~/Library/Application Support where most game saves live
ipcMain.handle('open-file-dialog', async () => {
  // Default to Application Support (where Unity/Steam saves typically are)
  const appSupport = path.join(app.getPath('home'), 'Library', 'Application Support');
  const defaultDir = fs.existsSync(appSupport) ? appSupport : app.getPath('home');

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Save File',
    defaultPath: defaultDir,
    filters: [
      { name: 'DAT Files', extensions: ['dat'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile', 'showHiddenFiles']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, canceled: true };
  }

  return { success: true, filePath: result.filePaths[0] };
});

// Parse a file from path (used by recent files and open dialog)
ipcMain.handle('parse-file', async (event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    currentFileBuffer = buffer;
    currentFilePath = filePath;
    currentFileName = path.basename(filePath);

    const parser = new UnitySaveParser(buffer);
    const result = parser.parse();
    delete result.raw;

    currentItemCount = result.items.length;
    addRecentFile(filePath, currentItemCount);

    return {
      success: true,
      data: result,
      fileInfo: {
        name: path.basename(filePath),
        path: filePath,
        size: buffer.length
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Parse file from raw bytes (used by drag-and-drop)
ipcMain.handle('parse-buffer', async (event, { arrayBuffer, fileName }) => {
  try {
    const buffer = Buffer.from(arrayBuffer);
    currentFileBuffer = buffer;
    currentFilePath = null; // no path available from drag-and-drop
    currentFileName = fileName;

    const parser = new UnitySaveParser(buffer);
    const result = parser.parse();
    delete result.raw;

    currentItemCount = result.items.length;

    return {
      success: true,
      data: result,
      fileInfo: {
        name: fileName,
        path: null,
        size: buffer.length
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Save modified file with auto-backup
ipcMain.handle('save-file', async (event, { modifications }) => {
  try {
    if (!currentFileBuffer) {
      return { success: false, error: 'No file loaded' };
    }

    // Default to original file path if available, otherwise use original filename on Desktop
    const defaultPath = currentFilePath
      ? currentFilePath
      : path.join(app.getPath('desktop'), currentFileName || 'save.dat');

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Modified File',
      defaultPath: defaultPath,
      filters: [
        { name: 'DAT Files', extensions: ['dat'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['showHiddenFiles']
    });

    if (result.canceled) return { success: false, canceled: true };

    // Auto-create backup if saving over the original file
    const savePath = result.filePath;
    if (fs.existsSync(savePath)) {
      const backupPath = savePath + '.bak';
      fs.copyFileSync(savePath, backupPath);
    }

    // Apply modifications to a copy of the buffer
    const modified = Buffer.from(currentFileBuffer);

    for (const mod of modifications) {
      if (mod.type === 'double' || mod.type === 'item') {
        modified.writeDoubleLE(mod.newValue, mod.offset);
      } else if (mod.type === 'mantissa_exponent') {
        modified.writeDoubleLE(mod.newMantissa, mod.mantissaOffset);
        modified.writeBigInt64LE(BigInt(mod.newExponent), mod.exponentOffset);
      } else if (mod.type === 'uint32') {
        modified.writeUInt32LE(mod.newValue >>> 0, mod.offset);
      }
    }

    fs.writeFileSync(savePath, modified);

    // Update recent files with save path
    if (currentFilePath) {
      addRecentFile(currentFilePath, currentItemCount);
    } else {
      // If loaded via drag-and-drop, now we have a path
      currentFilePath = savePath;
      addRecentFile(savePath, currentItemCount);
    }

    return { success: true, filePath: savePath };
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
