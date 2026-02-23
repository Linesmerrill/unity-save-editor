# Unity Save Editor

A drag-and-drop Mac app for editing Unity `.dat` save files. Supports games like Idle Cave Miner and other Unity titles that use binary save formats.

## Features

- **Drag & Drop** — drop any `.dat` save file to load it
- **Items Editor** — view and edit all inventory items with bulk-set functionality
- **Currency Editor** — modify coins, prestige points, premium currency (supports mantissa/exponent format)
- **Fields Editor** — edit floor levels, stats, and other game values
- **Custom Names** — label item IDs with friendly names (persisted across sessions)
- **Safe Editing** — saves to a new file by default so your original is preserved

## Installation

### From Release (easiest)
1. Download the latest `.dmg` from [Releases](../../releases)
2. Open the `.dmg` and drag the app to your Applications folder
3. Launch Unity Save Editor

### From Source
```bash
git clone https://github.com/YOUR_USERNAME/unity-save-editor.git
cd unity-save-editor
npm install
npm start
```

### Build the DMG yourself
```bash
npm run dist
```

## Usage

1. **Find your save file** — Unity games on Mac typically save to:
   - `~/Library/Application Support/<Developer>/<Game>/`
   - Example: `~/Library/Application Support/Cold Hours/Idle Cave Miner/IdleMinerSave.dat`

2. **Back up your save** — Always make a copy before editing!

3. **Drag the `.dat` file** onto the app window

4. **Edit values** — Change individual items or use "Set All Items To" for bulk edits

5. **Save** — Click "Save Modified File" and replace your original save (game must be closed)

6. **Launch the game** — Your modified values should be loaded

## Supported Save Format

The editor parses Unity binary save files that contain:
- Item sections with string IDs and double-precision values
- Currency sections with mantissa/exponent scientific notation
- Key-value fields with various data types

## Tech Stack

- Electron
- Vanilla HTML/CSS/JS
- No external runtime dependencies

## License

MIT
