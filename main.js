const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { UnitySaveParser } = require('./src/parser.js');
const { TextSaveParser } = require('./src/text-parser.js');

const GITHUB_REPO = 'linesmerrill/unity-save-editor';

let mainWindow;
let currentFileBuffer = null;
let currentFilePath = null;
let currentFileName = null;
let currentItemCount = 0;
let currentFormat = null; // 'binary' or 'text'
let lastBrowsedDir = null; // remember where user last navigated

// Detect whether a buffer is a text-based or binary save file
function detectFormat(buffer) {
  // Text-based files start with readable ASCII like "CHARACTER = {"
  // Binary Unity files contain null bytes and binary markers early on
  const head = buffer.slice(0, 200);
  const nullCount = [...head].filter(b => b === 0).length;
  // If there are null bytes in the first 200 bytes, it's binary
  if (nullCount > 2) return 'binary';
  // Check if it looks like key = value text
  const text = head.toString('utf8');
  if (/^\w+\s*=\s*\{/.test(text.trim())) return 'text';
  // Default to binary
  return 'binary';
}

function parseBuffer(buffer) {
  const format = detectFormat(buffer);
  currentFormat = format;
  if (format === 'text') {
    const parser = new TextSaveParser(buffer);
    return parser.parse();
  } else {
    const parser = new UnitySaveParser(buffer);
    return parser.parse();
  }
}

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

app.whenReady().then(() => {
  loadSettings();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Settings helpers — persist last browsed directory across sessions
function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const p = getSettingsPath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      lastBrowsedDir = data.lastBrowsedDir || null;
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(getSettingsPath(), JSON.stringify({
      lastBrowsedDir: lastBrowsedDir
    }, null, 2));
  } catch (err) {
    console.error('Error saving settings:', err);
  }
}

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

// Open file dialog — remembers last browsed directory
ipcMain.handle('open-file-dialog', async () => {
  // Priority: last browsed dir > current file's dir > Application Support > home
  let defaultDir = lastBrowsedDir;
  if (!defaultDir && currentFilePath) {
    defaultDir = path.dirname(currentFilePath);
  }
  if (!defaultDir) {
    const appSupport = path.join(app.getPath('home'), 'Library', 'Application Support');
    defaultDir = fs.existsSync(appSupport) ? appSupport : app.getPath('home');
  }

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

  // Remember this directory for next time (persists across sessions)
  lastBrowsedDir = path.dirname(result.filePaths[0]);
  saveSettings();

  return { success: true, filePath: result.filePaths[0] };
});

// Parse a file from path (used by recent files and open dialog)
ipcMain.handle('parse-file', async (event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    currentFileBuffer = buffer;
    currentFilePath = filePath;
    currentFileName = path.basename(filePath);
    lastBrowsedDir = path.dirname(filePath);
    saveSettings();

    const result = parseBuffer(buffer);
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

    const result = parseBuffer(buffer);
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

    // Apply modifications based on format
    let outputData;

    if (currentFormat === 'text') {
      // Text-based saves: apply text replacements
      const originalText = currentFileBuffer.toString('utf8');
      const modifiedText = TextSaveParser.applyModifications(originalText, modifications);
      outputData = Buffer.from(modifiedText, 'utf8');
    } else {
      // Binary saves: write bytes directly
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
      outputData = modified;
    }

    fs.writeFileSync(savePath, outputData);

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

// Get current app version
ipcMain.handle('get-version', async () => {
  return require('./package.json').version;
});

// Check for updates via GitHub Releases API
ipcMain.handle('check-for-updates', async () => {
  const currentVersion = require('./package.json').version;

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/releases/latest`,
      headers: { 'User-Agent': 'unity-save-editor' }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          const latestVersion = (release.tag_name || '').replace(/^v/, '');
          const dmgAsset = (release.assets || []).find(a => a.name.endsWith('.dmg'));

          if (!latestVersion) {
            resolve({ hasUpdate: false, error: 'Could not determine latest version' });
            return;
          }

          const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

          resolve({
            hasUpdate,
            currentVersion,
            latestVersion,
            downloadUrl: dmgAsset ? dmgAsset.browser_download_url : null,
            releaseUrl: release.html_url,
            releaseName: release.name,
            releaseNotes: (release.body || '').slice(0, 500)
          });
        } catch (err) {
          resolve({ hasUpdate: false, error: 'Failed to parse update info: ' + err.message });
        }
      });
    }).on('error', (err) => {
      resolve({ hasUpdate: false, error: 'Network error: ' + err.message });
    });
  });
});

// Open URL in default browser
ipcMain.handle('open-external', async (event, url) => {
  shell.openExternal(url);
});

// Compare semver strings: returns 1 if a > b, -1 if a < b, 0 if equal
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}
