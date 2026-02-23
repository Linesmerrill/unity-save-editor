// State
let currentFile = null;
let parsedData = null;
let customNames = {};
let modifications = new Map();

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const editor = document.getElementById('editor');
const fileName = document.getElementById('file-name');
const fileSize = document.getElementById('file-size');
const itemsBody = document.getElementById('items-body');
const currenciesBody = document.getElementById('currencies-body');
const fieldsBody = document.getElementById('fields-body');
const bulkValue = document.getElementById('bulk-value');

// Initialize
async function init() {
  customNames = await window.api.loadNames() || {};
  setupDragDrop();
  setupTabs();
  setupButtons();
  await loadRecentFiles();
}

// Load and display recent files on the drop screen
async function loadRecentFiles() {
  const recents = await window.api.loadRecents();
  const recentFilesDiv = document.getElementById('recent-files');
  const recentList = document.getElementById('recent-list');

  if (!recents || recents.length === 0) {
    recentFilesDiv.classList.add('hidden');
    return;
  }

  recentFilesDiv.classList.remove('hidden');
  recentList.innerHTML = '';

  for (const entry of recents) {
    const item = document.createElement('div');
    item.className = 'recent-item';

    const timeAgo = getTimeAgo(entry.lastOpened);

    const sizeStr = entry.fileSize ? formatBytes(entry.fileSize) : '';

    item.innerHTML = `
      <div class="recent-item-info">
        <span class="recent-item-name">${escapeHtml(entry.name)}${sizeStr ? ` <span class="recent-item-size">${sizeStr}</span>` : ''}</span>
        <span class="recent-item-path">${escapeHtml(entry.dir)}</span>
      </div>
      <div class="recent-item-actions">
        <div class="recent-item-meta">
          <span class="recent-item-items">${entry.itemCount} items</span>
          <span class="recent-item-date">${timeAgo}</span>
        </div>
        <button class="recent-remove-btn" title="Remove from recents">&times;</button>
      </div>
    `;

    // Click row to open file
    item.addEventListener('click', (e) => {
      if (e.target.closest('.recent-remove-btn')) return;
      e.stopPropagation();
      loadFileFromPath(entry.path);
    });

    // Click X to remove from recents
    item.querySelector('.recent-remove-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.api.removeRecent(entry.path);
      await loadRecentFiles();
    });

    recentList.appendChild(item);
  }

  // Clear All button
  const clearAllBtn = document.createElement('button');
  clearAllBtn.className = 'recent-clear-all';
  clearAllBtn.textContent = 'Clear All';
  clearAllBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await window.api.clearRecents();
    await loadRecentFiles();
  });
  recentList.appendChild(clearAllBtn);
}

// Load a file directly from a path (used by recent files)
async function loadFileFromPath(filePath) {
  try {
    const result = await window.api.parseFile(filePath);

    if (!result.success) {
      showToast('Error: ' + result.error, true);
      return;
    }

    currentFile = result.fileInfo;
    parsedData = result.data;
    modifications.clear();

    fileName.textContent = currentFile.name;
    fileSize.textContent = formatBytes(currentFile.size);
    document.getElementById('items-count').textContent = parsedData.items.length;
    document.getElementById('currencies-count').textContent = parsedData.currencies.length;
    document.getElementById('fields-count').textContent = parsedData.fields.length;

    renderItems();
    renderCurrencies();
    renderFields();

    dropZone.classList.add('hidden');
    editor.classList.remove('hidden');

    showToast(`Loaded ${parsedData.items.length} items, ${parsedData.currencies.length} currencies`);
  } catch (err) {
    showToast('Error: ' + err.message, true);
    console.error(err);
  }
}

function getTimeAgo(isoDate) {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

// Drag and Drop
function setupDragDrop() {
  // Prevent default on dragover/dragenter to allow drops (must not stopPropagation)
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('dragenter', (e) => e.preventDefault());

  dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

  // Handle the drop on the entire document
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');

    const files = e.dataTransfer ? e.dataTransfer.files : null;
    if (!files || files.length === 0) return;

    const file = files[0];

    // file.path is undefined in Electron 40+, so read bytes with FileReader
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await window.api.parseBuffer({
        arrayBuffer: arrayBuffer,
        fileName: file.name
      });

      if (!result.success) {
        showToast('Error parsing file: ' + result.error, true);
        return;
      }

      currentFile = result.fileInfo;
      parsedData = result.data;
      modifications.clear();

      fileName.textContent = currentFile.name;
      fileSize.textContent = formatBytes(currentFile.size);
      document.getElementById('items-count').textContent = parsedData.items.length;
      document.getElementById('currencies-count').textContent = parsedData.currencies.length;
      document.getElementById('fields-count').textContent = parsedData.fields.length;

      renderItems();
      renderCurrencies();
      renderFields();

      dropZone.classList.add('hidden');
      editor.classList.remove('hidden');

      showToast(`Loaded ${parsedData.items.length} items, ${parsedData.currencies.length} currencies`);
    } catch (err) {
      showToast('Error: ' + err.message, true);
      console.error(err);
    }
  });

  // Use native file dialog for browsing
  document.querySelector('.drop-area').addEventListener('click', openFileBrowser);
}

// Open native file dialog
async function openFileBrowser() {
  const result = await window.api.openFileDialog();
  if (result.success && result.filePath) {
    loadFileFromPath(result.filePath);
  }
}

// Tabs
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

// Buttons
function setupButtons() {
  document.getElementById('btn-save').addEventListener('click', saveFile);
  document.getElementById('btn-new').addEventListener('click', resetEditor);
  document.getElementById('btn-bulk-set').addEventListener('click', bulkSetItems);
}


// Render items table
function renderItems() {
  itemsBody.innerHTML = '';

  for (const item of parsedData.items) {
    const tr = document.createElement('tr');

    const customName = customNames[item.id] || '';
    const valueStr = formatNumber(item.value);
    const isLarge = item.value >= 1000000;

    tr.innerHTML = `
      <td><code>${escapeHtml(item.id)}</code></td>
      <td>
        <input type="text" class="name-input ${customName ? 'has-name' : ''}"
               data-item-id="${escapeHtml(item.id)}"
               value="${escapeHtml(customName)}"
               placeholder="Click to name...">
      </td>
      <td>
        <span class="value-display ${isLarge ? 'large' : ''}">${valueStr}</span>
      </td>
      <td>
        <input type="number" class="new-value-input"
               data-offset="${item.offset}"
               data-type="item"
               placeholder="${valueStr}">
        <span class="modified-indicator" id="mod-${item.offset}"></span>
      </td>
    `;

    const nameInput = tr.querySelector('.name-input');
    nameInput.addEventListener('change', async (e) => {
      const id = e.target.dataset.itemId;
      const name = e.target.value.trim();
      if (name) {
        customNames[id] = name;
        e.target.classList.add('has-name');
      } else {
        delete customNames[id];
        e.target.classList.remove('has-name');
      }
      await window.api.saveNames(customNames);
    });

    const valueInput = tr.querySelector('.new-value-input');
    valueInput.addEventListener('input', (e) => {
      const offset = parseInt(e.target.dataset.offset);
      const indicator = document.getElementById(`mod-${offset}`);
      const rawVal = e.target.value.trim();

      if (!rawVal) {
        modifications.delete(offset);
        indicator.classList.remove('visible');
        e.target.classList.remove('input-error');
        return;
      }

      const parsed = parseFloat(rawVal);
      if (isNaN(parsed) || !isFinite(parsed) || parsed < 0) {
        e.target.classList.add('input-error');
        indicator.classList.remove('visible');
        return;
      }

      e.target.classList.remove('input-error');
      modifications.set(offset, {
        offset: offset,
        newValue: parsed,
        section: 'Items',
        type: 'double'
      });
      indicator.classList.add('visible');
    });

    itemsBody.appendChild(tr);
  }
}

// Render currencies table
function renderCurrencies() {
  currenciesBody.innerHTML = '';

  for (const currency of parsedData.currencies) {
    const tr = document.createElement('tr');
    const valueStr = currency.type === 'mantissa_exponent'
      ? formatScientific(currency.mantissa, currency.exponent)
      : formatNumber(currency.value);

    // Friendly currency name
    const friendlyName = currency.section
      .replace('CurrencyCoinsV2', 'Coins')
      .replace('CurrencyPrestigeV2', 'Prestige')
      .replace('CurrencyPremium', 'Premium');

    tr.innerHTML = `
      <td>${escapeHtml(friendlyName)}</td>
      <td>${escapeHtml(currency.world || '-')}</td>
      <td><span class="value-display">${valueStr}</span></td>
      <td>
        ${currency.type === 'double' ? `
          <input type="text" class="new-value-input currency-input"
                 data-offset="${currency.offset}"
                 data-type="double"
                 placeholder="e.g. 999000000"
                 title="Enter a whole number like 999000000">
        ` : `
          <input type="text" class="new-value-input currency-input"
                 data-mantissa-offset="${currency.mantissaOffset}"
                 data-exponent-offset="${currency.exponentOffset}"
                 data-type="mantissa_exponent"
                 placeholder="e.g. 1e50 or 999000000"
                 title="Enter a number like 999000000 or scientific like 1e50">
        `}
      </td>
    `;

    const valueInput = tr.querySelector('.new-value-input');
    valueInput.addEventListener('change', (e) => {
      const rawVal = e.target.value.trim();
      if (!rawVal) {
        // Cleared — remove modification
        const type = e.target.dataset.type;
        if (type === 'double') {
          modifications.delete(parseInt(e.target.dataset.offset));
        } else {
          modifications.delete(parseInt(e.target.dataset.mantissaOffset));
        }
        e.target.classList.remove('input-error', 'input-modified');
        return;
      }

      const parsed = parseNumberInput(rawVal);
      if (parsed === null) {
        e.target.classList.add('input-error');
        e.target.classList.remove('input-modified');
        showToast('Invalid number. Use digits like 999000000 or scientific like 1e50', true);
        return;
      }

      e.target.classList.remove('input-error');
      e.target.classList.add('input-modified');

      const type = e.target.dataset.type;
      if (type === 'double') {
        const offset = parseInt(e.target.dataset.offset);
        modifications.set(offset, {
          offset: offset,
          newValue: parsed,
          type: 'double'
        });
      } else if (type === 'mantissa_exponent') {
        const mantissaOffset = parseInt(e.target.dataset.mantissaOffset);
        const exponentOffset = parseInt(e.target.dataset.exponentOffset);
        const { mantissa, exponent } = toMantissaExponent(parsed);
        modifications.set(mantissaOffset, {
          mantissaOffset: mantissaOffset,
          exponentOffset: exponentOffset,
          newMantissa: mantissa,
          newExponent: exponent,
          type: 'mantissa_exponent'
        });
      }
    });

    currenciesBody.appendChild(tr);
  }
}

// Render fields table
function renderFields() {
  fieldsBody.innerHTML = '';

  for (const field of parsedData.fields) {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${escapeHtml(field.section)}</td>
      <td>${escapeHtml(field.world)}</td>
      <td><span class="value-display">${field.value}</span></td>
      <td>
        <input type="number" class="new-value-input"
               data-offset="${field.offset}"
               data-type="uint32"
               placeholder="${field.value}">
      </td>
    `;

    const valueInput = tr.querySelector('.new-value-input');
    valueInput.addEventListener('input', (e) => {
      const offset = parseInt(e.target.dataset.offset);
      const rawVal = e.target.value.trim();

      if (!rawVal) {
        modifications.delete(offset);
        e.target.classList.remove('input-error');
        return;
      }

      const parsed = parseInt(rawVal);
      const validation = validateForType(parsed, 'uint32');
      if (!validation.valid) {
        e.target.classList.add('input-error');
        e.target.title = validation.error;
        return;
      }

      e.target.classList.remove('input-error');
      e.target.title = '';
      modifications.set(offset, {
        offset: offset,
        newValue: validation.value,
        type: 'uint32'
      });
    });

    fieldsBody.appendChild(tr);
  }
}

// Bulk set all items
function bulkSetItems() {
  const value = parseFloat(bulkValue.value);
  if (isNaN(value)) {
    showToast('Enter a valid number', true);
    return;
  }

  const inputs = itemsBody.querySelectorAll('.new-value-input');
  inputs.forEach(input => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  });

  showToast(`Set ${inputs.length} items to ${formatNumber(value)}`);
}

// Save modified file — send modifications to main process
async function saveFile() {
  if (!currentFile || modifications.size === 0) {
    showToast('No changes to save', true);
    return;
  }

  const modsArray = Array.from(modifications.values());
  const result = await window.api.saveFile({ modifications: modsArray });

  if (result.success) {
    // Clear all modification tracking
    modifications.clear();

    // Clear red dots on items
    document.querySelectorAll('.modified-indicator').forEach(el => el.classList.remove('visible'));

    // Clear input values and styling on all tabs
    document.querySelectorAll('.new-value-input').forEach(input => {
      input.value = '';
      input.classList.remove('input-error', 'input-modified');
    });

    showToast(`Saved to ${result.filePath}`);
  } else if (!result.canceled) {
    showToast('Error saving: ' + result.error, true);
  }
}

// Reset to drop zone
async function resetEditor() {
  currentFile = null;
  parsedData = null;
  modifications.clear();
  editor.classList.add('hidden');
  dropZone.classList.remove('hidden');
  await loadRecentFiles();
}

// Parse user number input — supports plain numbers, commas, scientific notation
function parseNumberInput(str) {
  if (!str || !str.trim()) return null;
  str = str.trim().replace(/,/g, ''); // strip commas

  // Scientific notation like 1e50, 1.5e10, 1E6
  if (/^-?\d+(\.\d+)?[eE]\d+$/.test(str)) {
    const val = Number(str);
    return isFinite(val) ? val : null;
  }

  // Plain number (int or decimal)
  if (/^-?\d+(\.\d+)?$/.test(str)) {
    const val = Number(str);
    return isFinite(val) ? val : null;
  }

  return null; // invalid
}

// Validate and clamp for specific field types
function validateForType(value, type) {
  if (type === 'uint32') {
    value = Math.floor(value);
    if (value < 0) return { valid: false, error: 'Must be 0 or positive' };
    if (value > 4294967295) return { valid: false, error: 'Max is 4,294,967,295 for this field' };
    return { valid: true, value };
  }
  if (type === 'double' || type === 'item') {
    if (!isFinite(value)) return { valid: false, error: 'Number too large' };
    return { valid: true, value };
  }
  return { valid: true, value };
}

// Utilities
function formatNumber(n) {
  if (n === 0) return '0';
  const abs = Math.abs(n);
  // For very large numbers, show both friendly and scientific
  if (abs >= 1e15) {
    const sci = n.toExponential(2);
    // Try to show a friendly suffix too
    if (abs >= 1e60) return sci;
    if (abs >= 1e18) return `${sci} (${friendlyBigNumber(n)})`;
    return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function friendlyBigNumber(n) {
  const suffixes = [
    { val: 1e57, name: 'Octodecillion' }, { val: 1e54, name: 'Septendecillion' },
    { val: 1e51, name: 'Sexdecillion' }, { val: 1e48, name: 'Quindecillion' },
    { val: 1e45, name: 'Quattuordecillion' }, { val: 1e42, name: 'Tredecillion' },
    { val: 1e39, name: 'Duodecillion' }, { val: 1e36, name: 'Undecillion' },
    { val: 1e33, name: 'Decillion' }, { val: 1e30, name: 'Nonillion' },
    { val: 1e27, name: 'Octillion' }, { val: 1e24, name: 'Septillion' },
    { val: 1e21, name: 'Sextillion' }, { val: 1e18, name: 'Quintillion' },
  ];
  for (const s of suffixes) {
    if (Math.abs(n) >= s.val) {
      return (n / s.val).toFixed(1) + ' ' + s.name;
    }
  }
  return n.toExponential(2);
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  return (bytes / 1024).toFixed(1) + ' KB';
}

function formatScientific(mantissa, exponent) {
  if (mantissa === null) return '-';
  const val = mantissa * Math.pow(10, exponent);
  return formatNumber(val);
}

function toMantissaExponent(value) {
  if (value === 0) return { mantissa: 0, exponent: 0 };
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const mantissa = value / Math.pow(10, exponent);
  return { mantissa, exponent };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast' + (isError ? ' error' : '');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

// Initialize
init();
