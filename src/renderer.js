// State
let currentFile = null;
let parsedData = null;
let customNames = {};
let modifications = new Map();

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
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
}

// Drag and Drop
function setupDragDrop() {
  // Prevent default drag behaviors on the whole window
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

  dropZone.addEventListener('dragenter', () => dropZone.classList.add('dragover'));
  dropZone.addEventListener('dragover', () => dropZone.classList.add('dragover'));
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

  dropZone.addEventListener('drop', (e) => {
    dropZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      loadFile(files[0]);
    }
  });

  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      loadFile(e.target.files[0]);
    }
  });
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

// Load and parse file
async function loadFile(file) {
  try {
    // Read the file using FileReader since we get a File object from drag/drop
    const arrayBuffer = await file.arrayBuffer();
    currentFile = {
      name: file.name,
      path: file.path,
      size: file.size,
      buffer: arrayBuffer
    };

    // Parse the file
    const parser = new UnitySaveParser(Buffer.from(arrayBuffer));
    parsedData = parser.parse();

    // Update UI
    fileName.textContent = file.name;
    fileSize.textContent = formatBytes(file.size);
    document.getElementById('items-count').textContent = parsedData.items.length;
    document.getElementById('currencies-count').textContent = parsedData.currencies.length;
    document.getElementById('fields-count').textContent = parsedData.fields.length;

    // Render tables
    renderItems();
    renderCurrencies();
    renderFields();

    // Show editor
    dropZone.classList.add('hidden');
    editor.classList.remove('hidden');

    showToast(`Loaded ${parsedData.items.length} items, ${parsedData.currencies.length} currencies`);
  } catch (err) {
    showToast('Error parsing file: ' + err.message, true);
    console.error(err);
  }
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

    // Name input handler
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

    // Value input handler
    const valueInput = tr.querySelector('.new-value-input');
    valueInput.addEventListener('input', (e) => {
      const offset = parseInt(e.target.dataset.offset);
      const indicator = document.getElementById(`mod-${offset}`);
      if (e.target.value) {
        modifications.set(offset, {
          offset: offset,
          newValue: parseFloat(e.target.value),
          section: 'Items',
          type: 'double'
        });
        indicator.classList.add('visible');
      } else {
        modifications.delete(offset);
        indicator.classList.remove('visible');
      }
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

    tr.innerHTML = `
      <td>${escapeHtml(currency.section)}</td>
      <td>${escapeHtml(currency.world)}</td>
      <td><span class="value-display">${valueStr}</span></td>
      <td><code>${currency.mantissa !== null ? currency.mantissa.toFixed(6) : '-'}</code></td>
      <td><code>${currency.exponent !== null ? currency.exponent : '-'}</code></td>
      <td>
        ${currency.type === 'double' ? `
          <input type="number" class="new-value-input"
                 data-offset="${currency.offset}"
                 data-type="double"
                 placeholder="${formatNumber(currency.value)}">
        ` : `
          <input type="number" class="new-value-input"
                 data-mantissa-offset="${currency.mantissaOffset}"
                 data-exponent-offset="${currency.exponentOffset}"
                 data-type="mantissa_exponent"
                 placeholder="${valueStr}">
        `}
      </td>
    `;

    const valueInput = tr.querySelector('.new-value-input');
    valueInput.addEventListener('input', (e) => {
      const type = e.target.dataset.type;
      if (type === 'double') {
        const offset = parseInt(e.target.dataset.offset);
        if (e.target.value) {
          modifications.set(offset, {
            offset: offset,
            newValue: parseFloat(e.target.value),
            type: 'double'
          });
        } else {
          modifications.delete(offset);
        }
      } else if (type === 'mantissa_exponent') {
        const mantissaOffset = parseInt(e.target.dataset.mantissaOffset);
        const exponentOffset = parseInt(e.target.dataset.exponentOffset);
        if (e.target.value) {
          const newVal = parseFloat(e.target.value);
          // Convert to mantissa/exponent: find the right exponent
          const { mantissa, exponent } = toMantissaExponent(newVal);
          modifications.set(mantissaOffset, {
            mantissaOffset: mantissaOffset,
            exponentOffset: exponentOffset,
            newMantissa: mantissa,
            newExponent: exponent,
            type: 'mantissa_exponent'
          });
        } else {
          modifications.delete(mantissaOffset);
        }
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
      if (e.target.value) {
        modifications.set(offset, {
          offset: offset,
          newValue: parseInt(e.target.value),
          type: 'uint32'
        });
      } else {
        modifications.delete(offset);
      }
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

// Save modified file
async function saveFile() {
  if (!currentFile || modifications.size === 0) {
    showToast('No changes to save', true);
    return;
  }

  const buffer = new Uint8Array(currentFile.buffer.slice(0));
  const view = new DataView(buffer.buffer);

  for (const [key, mod] of modifications) {
    if (mod.type === 'double' || mod.section === 'Items') {
      view.setFloat64(mod.offset, mod.newValue, true);
    } else if (mod.type === 'mantissa_exponent') {
      view.setFloat64(mod.mantissaOffset, mod.newMantissa, true);
      // Write exponent as int64 LE
      const expBuf = new ArrayBuffer(8);
      const expView = new DataView(expBuf);
      expView.setBigInt64(0, BigInt(mod.newExponent), true);
      new Uint8Array(buffer.buffer).set(new Uint8Array(expBuf), mod.exponentOffset);
    } else if (mod.type === 'uint32') {
      view.setUint32(mod.offset, mod.newValue, true);
    }
  }

  const result = await window.api.saveFile({
    originalPath: currentFile.path,
    data: buffer.buffer
  });

  if (result.success) {
    showToast(`Saved to ${result.filePath}`);
  } else if (!result.canceled) {
    showToast('Error saving: ' + result.error, true);
  }
}

// Reset to drop zone
function resetEditor() {
  currentFile = null;
  parsedData = null;
  modifications.clear();
  editor.classList.add('hidden');
  dropZone.classList.remove('hidden');
  fileInput.value = '';
}

// Utilities
function formatNumber(n) {
  if (Math.abs(n) >= 1e15) return n.toExponential(2);
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
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

// Buffer polyfill for renderer
class Buffer {
  constructor(data) {
    if (data instanceof ArrayBuffer) {
      this._data = new Uint8Array(data);
    } else if (data instanceof Uint8Array) {
      this._data = data;
    } else {
      this._data = new Uint8Array(data);
    }
    this._view = new DataView(this._data.buffer, this._data.byteOffset, this._data.byteLength);
    this.length = this._data.length;
    this.byteLength = this._data.byteLength;
  }

  static from(data) {
    return new Buffer(data);
  }

  readDoubleLE(offset) {
    return this._view.getFloat64(offset, true);
  }

  readUInt32LE(offset) {
    return this._view.getUint32(offset, true);
  }

  readBigInt64LE(offset) {
    return this._view.getBigInt64(offset, true);
  }

  indexOf(pattern, fromIndex = 0) {
    if (typeof pattern === 'string') {
      pattern = new TextEncoder().encode(pattern);
    } else if (pattern instanceof Buffer) {
      pattern = pattern._data;
    }

    for (let i = fromIndex; i <= this.length - pattern.length; i++) {
      let found = true;
      for (let j = 0; j < pattern.length; j++) {
        if (this._data[i + j] !== pattern[j]) {
          found = false;
          break;
        }
      }
      if (found) return i;
    }
    return -1;
  }

  slice(start, end) {
    return new Buffer(this._data.slice(start, end));
  }

  toString(encoding) {
    const slice = this._data;
    return new TextDecoder().decode(slice);
  }

  // Array-like access
  get [Symbol.toPrimitive]() {
    return this._data;
  }
}

// Make Buffer indexable
Buffer = new Proxy(Buffer, {
  construct(target, args) {
    const instance = new target(...args);
    return new Proxy(instance, {
      get(obj, prop) {
        if (typeof prop === 'string' && !isNaN(prop)) {
          return obj._data[parseInt(prop)];
        }
        return obj[prop];
      }
    });
  }
});

// Initialize
init();
