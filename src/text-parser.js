/**
 * Text-based save file parser for games like Necesse.
 * Parses Lua-style key = value nested structures.
 */
class TextSaveParser {
  constructor(buffer) {
    this.text = buffer.toString('utf8');
    this.lines = this.text.split('\n');
  }

  parse() {
    const tree = this.parseTree(this.text);
    const items = [];
    const fields = [];
    const currencies = [];

    // Extract player stats
    const player = this.findSection(tree, 'PLAYER');
    if (player) {
      const playerFields = ['maxHealth', 'health', 'maxResilience', 'resilience',
        'maxMana', 'mana', 'hungerLevel', 'inventoryExtended', 'creativeMenuExtended',
        'autoOpenDoors', 'hotbarLocked', 'hasGodModeInCreative'];
      for (const key of playerFields) {
        if (player[key] !== undefined) {
          fields.push({
            section: 'Player',
            id: key,
            value: player[key],
            type: this.inferType(player[key])
          });
        }
      }
    }

    // Extract character info (may be at top level or under CHARACTER)
    const charSource = tree.CHARACTER || tree;
    const charFields = ['characterUniqueID', 'name'];
    for (const key of charFields) {
      if (charSource[key] !== undefined) {
        fields.push({
          section: 'Character',
          id: key,
          value: charSource[key],
          type: 'string'
        });
      }
    }

    // Extract inventory items — INVENTORY can be nested under PLAYER or at top level
    const inventory = (player && player.INVENTORY) || tree.INVENTORY;
    if (inventory) {
      this.extractInventoryItems(inventory, items);
      this.extractEquipment(inventory, items);
    }

    // Extract stats — can be under tree directly or nested
    const stats = tree.STATS || this.findSection(tree, 'STATS');
    if (stats) {
      for (const [key, val] of Object.entries(stats)) {
        if (val && typeof val === 'object' && val.value !== undefined) {
          fields.push({
            section: 'Stats',
            id: key,
            value: val.value,
            type: this.inferType(val.value)
          });
        }
      }
    }

    // Extract health upgrades — can be under PLAYER or top level
    const healthUpgrades = (player && player.HEALTH_UPGRADES) || tree.HEALTH_UPGRADES;
    if (healthUpgrades) {
      for (const [key, val] of Object.entries(healthUpgrades)) {
        if (typeof val !== 'object') {
          fields.push({
            section: 'Health Upgrades',
            id: key,
            value: val,
            type: this.inferType(val)
          });
        }
      }
    }

    return {
      format: 'text',
      items,
      currencies,
      fields
    };
  }

  extractInventoryItems(inventory, items) {
    const sections = ['MAIN', 'PARTY', 'CLOUD'];
    for (const sectionName of sections) {
      const section = inventory[sectionName];
      if (!section) continue;
      const sectionItems = this.collectItems(section);
      for (const item of sectionItems) {
        items.push({
          section: sectionName,
          slot: item.slot,
          id: item.stringID,
          amount: item.amount !== undefined ? item.amount : 1,
          enchantment: this.getEnchantment(item),
          locked: item.locked === true || item.locked === 'true'
        });
      }
    }
  }

  extractEquipment(inventory, items) {
    // Main equipment set
    const equipSections = ['ARMOR', 'COSMETIC', 'EQUIPMENT', 'TRINKETS'];
    for (const sectionName of equipSections) {
      const section = inventory[sectionName];
      if (!section) continue;
      const sectionItems = this.collectItems(section);
      for (const item of sectionItems) {
        items.push({
          section: sectionName,
          slot: item.slot,
          id: item.stringID,
          amount: item.amount !== undefined ? item.amount : 1,
          enchantment: this.getEnchantment(item),
          locked: item.locked === true || item.locked === 'true'
        });
      }
    }
  }

  getEnchantment(item) {
    if (item.GNDData && item.GNDData.enchantment && item.GNDData.enchantment.value) {
      const val = item.GNDData.enchantment.value;
      return val === 'noenchant' ? null : val;
    }
    // Check for numeric key enchantments (e.g., 222399799 = { gndType = itemenchant })
    if (item.GNDData) {
      for (const [key, val] of Object.entries(item.GNDData)) {
        if (val && typeof val === 'object' && val.gndType === 'itemenchant' && val.value) {
          return val.value === 'noenchant' ? null : val.value;
        }
      }
    }
    return null;
  }

  collectItems(section) {
    // ITEM entries are stored as arrays under the __items key
    return section.__items || [];
  }

  findSection(tree, name) {
    if (tree[name]) return tree[name];
    for (const val of Object.values(tree)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const found = this.findSection(val, name);
        if (found) return found;
      }
    }
    return null;
  }

  inferType(value) {
    if (typeof value === 'boolean' || value === 'true' || value === 'false') return 'boolean';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'int' : 'float';
    }
    if (typeof value === 'string' && /^-?\d+$/.test(value)) return 'int';
    if (typeof value === 'string' && /^-?\d+\.\d+$/.test(value)) return 'float';
    return 'string';
  }

  /**
   * Parse the Lua-style text into a nested object structure.
   * Handles repeated keys (like multiple ITEM = { ... }) by collecting them into __items arrays.
   */
  parseTree(text) {
    const result = {};
    let i = 0;
    const len = text.length;

    const skipWhitespace = () => {
      while (i < len && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) i++;
    };

    const parseValue = () => {
      skipWhitespace();
      if (i >= len) return null;

      if (text[i] === '{') {
        return parseBlock();
      }

      if (text[i] === '[') {
        return parseArray();
      }

      // Read until comma, newline, or closing brace
      let val = '';
      while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r' && text[i] !== '}') {
        val += text[i];
        i++;
      }
      val = val.trim();

      // Skip trailing comma
      if (i < len && text[i] === ',') i++;

      // Convert types
      if (val === 'true') return true;
      if (val === 'false') return false;
      if (/^-?\d+$/.test(val)) return parseInt(val, 10);
      if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
      return val;
    };

    const parseArray = () => {
      i++; // skip [
      const items = [];
      let current = '';
      let depth = 0;

      while (i < len) {
        if (text[i] === '[') depth++;
        if (text[i] === ']') {
          if (depth === 0) { i++; break; }
          depth--;
        }
        if (text[i] === ',' && depth === 0) {
          const trimmed = current.trim();
          if (trimmed) items.push(trimmed);
          current = '';
        } else {
          current += text[i];
        }
        i++;
      }
      const trimmed = current.trim();
      if (trimmed) items.push(trimmed);

      // Skip trailing comma
      skipWhitespace();
      if (i < len && text[i] === ',') i++;

      return items;
    };

    const parseBlock = () => {
      i++; // skip {
      const obj = {};
      const itemArrays = {}; // for repeated keys like ITEM

      skipWhitespace();

      while (i < len && text[i] !== '}') {
        skipWhitespace();
        if (i >= len || text[i] === '}') break;

        // Read key
        let key = '';
        while (i < len && text[i] !== '=' && text[i] !== '}' && text[i] !== '\n') {
          key += text[i];
          i++;
        }
        key = key.trim();

        if (!key || i >= len) break;

        if (text[i] === '=') {
          i++; // skip =
          skipWhitespace();
          const value = parseValue();

          // Handle repeated keys (like ITEM = { ... }, ITEM = { ... })
          if (obj.hasOwnProperty(key)) {
            if (!itemArrays[key]) {
              itemArrays[key] = [obj[key]];
            }
            itemArrays[key].push(value);
            obj[key] = value; // keep last value for direct access
          } else {
            obj[key] = value;
          }
        } else {
          // No = sign, skip line
          while (i < len && text[i] !== '\n') i++;
        }

        skipWhitespace();
        // Skip commas between entries
        if (i < len && text[i] === ',') i++;
        skipWhitespace();
      }

      if (i < len && text[i] === '}') i++;
      // Skip trailing comma
      skipWhitespace();
      if (i < len && text[i] === ',') i++;

      // Store repeated ITEM entries as __items array
      if (itemArrays.ITEM) {
        obj.__items = itemArrays.ITEM;
      }

      return obj;
    };

    // Parse top-level: KEY = { ... }
    skipWhitespace();
    while (i < len) {
      skipWhitespace();
      if (i >= len) break;

      let key = '';
      while (i < len && text[i] !== '=' && text[i] !== '\n') {
        key += text[i];
        i++;
      }
      key = key.trim();
      if (!key) { i++; continue; }

      if (i < len && text[i] === '=') {
        i++;
        skipWhitespace();
        result[key] = parseValue();
      }
      skipWhitespace();
    }

    return result;
  }

  /**
   * Apply modifications to the text-based save file.
   * Each mod specifies a field path and new value.
   */
  static applyModifications(originalText, modifications) {
    let text = originalText;

    for (const mod of modifications) {
      if (mod.fieldType === 'item-amount') {
        // Replace amount for a specific item at a specific slot in a specific section
        text = TextSaveParser.replaceItemAmount(text, mod.section, mod.slot, mod.newValue);
      } else if (mod.fieldType === 'player-field') {
        text = TextSaveParser.replaceSimpleValue(text, mod.id, mod.newValue);
      } else if (mod.fieldType === 'stat-field') {
        text = TextSaveParser.replaceStatValue(text, mod.id, mod.newValue);
      }
    }

    return text;
  }

  static replaceItemAmount(text, section, slot, newAmount) {
    // Find the section, then find ITEM with matching slot, then replace amount
    // Strategy: regex-based replacement scoped within the section
    const lines = text.split('\n');
    let inSection = false;
    let braceDepth = 0;
    let foundSection = false;
    let inItem = false;
    let itemBraceDepth = 0;
    let correctSlot = false;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      if (!foundSection && trimmed === `${section} = {`) {
        foundSection = true;
        inSection = true;
        braceDepth = 1;
        continue;
      }

      if (inSection) {
        for (const ch of trimmed) {
          if (ch === '{') braceDepth++;
          if (ch === '}') braceDepth--;
        }
        if (braceDepth <= 0) {
          inSection = false;
          continue;
        }

        if (trimmed === 'ITEM = {') {
          inItem = true;
          itemBraceDepth = 1;
          correctSlot = false;
          continue;
        }

        if (inItem) {
          for (const ch of trimmed) {
            if (ch === '{') itemBraceDepth++;
          }

          const slotMatch = trimmed.match(/^slot\s*=\s*(\d+)/);
          if (slotMatch && parseInt(slotMatch[1]) === slot) {
            correctSlot = true;
          }

          if (correctSlot && trimmed.match(/^amount\s*=/)) {
            const indent = lines[i].match(/^(\s*)/)[1];
            const hasComma = trimmed.endsWith(',');
            lines[i] = `${indent}amount = ${newAmount}${hasComma ? ',' : ''}`;
            return lines.join('\n');
          }

          for (const ch of trimmed) {
            if (ch === '}') itemBraceDepth--;
          }
          if (itemBraceDepth <= 0) {
            inItem = false;
          }
        }
      }
    }

    return text; // no change if not found
  }

  static replaceSimpleValue(text, key, newValue) {
    // Replace a simple key = value line (e.g., maxHealth = 100)
    const regex = new RegExp(`(\\b${key}\\s*=\\s*)([^,\\n}]+)`, 'g');
    let replaced = false;
    const result = text.replace(regex, (match, prefix) => {
      if (replaced) return match; // only replace first occurrence
      replaced = true;
      return prefix + String(newValue);
    });
    return result;
  }

  static replaceStatValue(text, statName, newValue) {
    // Stats are stored as: stat_name = { value = X }
    const lines = text.split('\n');
    let foundStat = false;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed === `${statName} = {`) {
        foundStat = true;
        continue;
      }
      if (foundStat && trimmed.match(/^value\s*=/)) {
        const indent = lines[i].match(/^(\s*)/)[1];
        lines[i] = `${indent}value = ${newValue}`;
        return lines.join('\n');
      }
      if (foundStat && trimmed === '}') {
        foundStat = false;
      }
    }

    return text;
  }
}

module.exports = { TextSaveParser };
