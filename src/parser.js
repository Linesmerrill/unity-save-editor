/**
 * Unity .dat Save File Parser
 *
 * Parses binary save files used by Unity games.
 * Detects sections like Items, Currencies (mantissa/exponent), and key-value fields.
 */

class UnitySaveParser {
  constructor(buffer) {
    this.buffer = Buffer.from(buffer);
    this.offset = 0;
  }

  /**
   * Parse the entire save file and return structured data
   */
  parse() {
    const result = {
      items: [],
      currencies: [],
      fields: [],
      raw: this.buffer
    };

    // Find and parse Items section
    const itemsResult = this.parseItemsSection();
    if (itemsResult) {
      result.items = itemsResult;
    }

    // Find and parse currency sections
    const currencySections = [
      'CurrencyCoinsV2',
      'CurrencyPrestigeV2',
      'CurrencyPremium'
    ];

    for (const sectionName of currencySections) {
      const currencies = this.parseCurrencySection(sectionName);
      if (currencies.length > 0) {
        result.currencies.push(...currencies);
      }
    }

    // Find other notable fields
    const fieldNames = [
      'MaxFloor', 'ActiveFloorV1', 'ClearedFloorV1',
      'TowerGems'
    ];

    for (const fieldName of fieldNames) {
      const fields = this.parseFieldSection(fieldName);
      if (fields.length > 0) {
        result.fields.push(...fields);
      }
    }

    return result;
  }

  /**
   * Find a string pattern in the buffer and return its offset
   */
  findPattern(pattern) {
    const patternBuf = Buffer.from(pattern, 'ascii');
    const idx = this.buffer.indexOf(patternBuf);
    return idx === -1 ? null : idx;
  }

  /**
   * Parse the Items section
   * Format: "Items\x00" + 4-byte size + items...
   * Each item: \x01 + string_id + \x00 + 8-byte double value
   */
  parseItemsSection() {
    const idx = this.findPattern('Items\x00');
    if (idx === null) return null;

    // Read section size (4 bytes after "Items\x00")
    const sectionStart = idx + 6; // "Items" + null
    const sectionSize = this.buffer.readUInt32LE(sectionStart);
    const sectionEnd = sectionStart + 4 + sectionSize;

    let pos = sectionStart + 4;
    const items = [];

    while (pos < sectionEnd && pos < this.buffer.length) {
      const byte = this.buffer[pos];

      if (byte === 0x01) {
        pos++;
        // Read null-terminated string ID
        const strStart = pos;
        while (pos < this.buffer.length && this.buffer[pos] !== 0x00) {
          pos++;
        }
        const itemId = this.buffer.slice(strStart, pos).toString('ascii');
        pos++; // skip null

        // Read 8-byte double value
        if (pos + 8 <= this.buffer.length) {
          const value = this.buffer.readDoubleLE(pos);
          items.push({
            id: itemId,
            value: value,
            offset: pos,
            section: 'Items'
          });
          pos += 8;
        }
      } else if (byte === 0x00) {
        break;
      } else {
        pos++;
      }
    }

    return items;
  }

  /**
   * Parse a currency section with mantissa/exponent pairs
   * Format: section_name + worlds with mantissa (double) + exponent (int)
   */
  parseCurrencySection(sectionName) {
    const idx = this.findPattern(sectionName + '\x00');
    if (idx === null) return [];

    const currencies = [];

    // Special handling for CurrencyPremium (single double value, no mantissa/exponent)
    if (sectionName === 'CurrencyPremium') {
      const pos = idx + sectionName.length + 1; // skip name + null
      if (pos + 8 <= this.buffer.length) {
        const value = this.buffer.readDoubleLE(pos);
        currencies.push({
          section: sectionName,
          world: 'Global',
          value: value,
          mantissa: null,
          exponent: null,
          offset: pos,
          type: 'double'
        });
      }
      return currencies;
    }

    // For other currencies, look for mantissa/exponent patterns within the section
    const worlds = ['TheCaves', 'CoalPits', 'Scrapyard', 'DragonMountains'];

    // Search for each world within the section
    let searchStart = idx;
    const searchEnd = Math.min(idx + 500, this.buffer.length); // reasonable search range

    for (const world of worlds) {
      const worldPattern = world + '\x00';
      const worldBuf = Buffer.from(worldPattern, 'ascii');

      // Find this world within the section area
      let worldIdx = this.buffer.indexOf(worldBuf, searchStart);
      if (worldIdx === null || worldIdx === -1 || worldIdx > searchEnd) continue;

      // Look for mantissa after the world name
      const mantissaPattern = Buffer.from('mantissa\x00', 'ascii');
      let mantissaIdx = this.buffer.indexOf(mantissaPattern, worldIdx);
      if (mantissaIdx === -1 || mantissaIdx > worldIdx + 100) continue;

      const mantissaValueOffset = mantissaIdx + 9; // "mantissa" + null
      if (mantissaValueOffset + 8 > this.buffer.length) continue;
      const mantissa = this.buffer.readDoubleLE(mantissaValueOffset);

      // Look for exponent after mantissa
      const exponentPattern = Buffer.from('exponent\x00', 'ascii');
      let exponentIdx = this.buffer.indexOf(exponentPattern, mantissaValueOffset);
      if (exponentIdx === -1 || exponentIdx > mantissaValueOffset + 30) continue;

      const exponentValueOffset = exponentIdx + 9; // "exponent" + null
      if (exponentValueOffset + 8 > this.buffer.length) continue;
      // Exponent appears to be stored as int64 LE
      const exponent = Number(this.buffer.readBigInt64LE(exponentValueOffset));

      // Calculate the actual value: mantissa * 10^exponent
      const actualValue = mantissa * Math.pow(10, exponent);

      currencies.push({
        section: sectionName,
        world: world,
        value: actualValue,
        mantissa: mantissa,
        exponent: exponent,
        mantissaOffset: mantissaValueOffset,
        exponentOffset: exponentValueOffset,
        type: 'mantissa_exponent'
      });

      searchStart = exponentValueOffset + 8;
    }

    return currencies;
  }

  /**
   * Parse simple field sections that contain world-based integer values
   */
  parseFieldSection(sectionName) {
    const idx = this.findPattern(sectionName + '\x00');
    if (idx === null) return [];

    const fields = [];
    const worlds = ['TheCaves', 'CoalPits', 'Scrapyard', 'DragonMountains'];

    let searchStart = idx;
    const searchEnd = Math.min(idx + 200, this.buffer.length);

    for (const world of worlds) {
      const worldBuf = Buffer.from(world + '\x00', 'ascii');
      let worldIdx = this.buffer.indexOf(worldBuf, searchStart);
      if (worldIdx === -1 || worldIdx > searchEnd) continue;

      // After world name + null, read a value
      const valueOffset = worldIdx + world.length + 1;
      if (valueOffset + 4 <= this.buffer.length) {
        const value = this.buffer.readUInt32LE(valueOffset);
        fields.push({
          section: sectionName,
          world: world,
          value: value,
          offset: valueOffset,
          type: 'uint32'
        });
        searchStart = valueOffset + 4;
      }
    }

    return fields;
  }
}

/**
 * Write modified values back to the buffer
 */
function writeModifiedSave(originalBuffer, modifications) {
  const buffer = Buffer.from(originalBuffer);

  for (const mod of modifications) {
    if (mod.type === 'double' || mod.section === 'Items') {
      buffer.writeDoubleLE(mod.newValue, mod.offset);
    } else if (mod.type === 'mantissa_exponent') {
      // Write mantissa and exponent separately
      if (mod.mantissaOffset !== undefined) {
        buffer.writeDoubleLE(mod.newMantissa, mod.mantissaOffset);
      }
      if (mod.exponentOffset !== undefined) {
        buffer.writeBigInt64LE(BigInt(mod.newExponent), mod.exponentOffset);
      }
    } else if (mod.type === 'uint32') {
      buffer.writeUInt32LE(mod.newValue, mod.offset);
    }
  }

  return buffer;
}

module.exports = { UnitySaveParser, writeModifiedSave };
