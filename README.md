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
1. Download the latest `.dmg` from [Releases](https://github.com/linesmerrill/unity-save-editor/releases)
2. Open the `.dmg` and drag the app to your Applications folder
3. Launch Unity Save Editor

> **macOS Gatekeeper notice:** Since the app isn't signed with an Apple Developer certificate, macOS will show a warning saying it "can't be opened because Apple cannot check it for malicious software." To open it, go to **System Settings > Privacy & Security**, scroll down, and click **Open Anyway**. You only need to do this once.

> Releases are built automatically — every push to `main` triggers a new build and attaches the DMG to a GitHub Release.

### From Source
```bash
git clone https://github.com/linesmerrill/unity-save-editor.git
cd unity-save-editor
npm install
npm start
```

### Build the DMG yourself
```bash
npm run dist
```

## Getting Started

### Loading a Save File

There are two ways to open a save file:

- **Drag and drop** — drag a `.dat` file directly onto the app window
- **Click to browse** — click the drop area to open a file picker (it starts in `~/Library/Application Support` where most game saves live, and hidden folders are visible so you can find `Library`)

Unity games on Mac typically save to `~/Library/Application Support/<Developer>/<Game>/`. For example, Idle Cave Miner saves to `~/Library/Application Support/Cold Hours/Idle Cave Miner/IdleMinerSave.dat`.

Once you've opened a file, it will appear under **Recent Files** on the home screen so you can quickly reopen it next time. You can remove individual entries or clear the whole list.

### Editing Values

The editor has three tabs:

- **Items** — your inventory items. Each row shows the item's internal ID, an optional custom name you can set, and the current value. Type a new value in the "New Value" column to change it. Use the **"Set all items to"** toolbar at the top to bulk-set every item at once (e.g. enter `999000000` and click "Apply to All").

- **Currencies** — in-game currencies like coins, prestige points, and premium currency. Some currencies use very large numbers internally (mantissa + exponent pairs), but you don't need to worry about that — just type the number you want (like `999000000` or `1e50` for scientific notation) and the app handles the conversion.

- **Fields** — other game values like floor levels, tower gems, and stats. These are stored as whole numbers (0 to 4,294,967,295).

A red dot appears next to any value you've changed. Invalid inputs are highlighted in red.

### Saving

Click **"Save Modified File"** to save your changes. The app will open a save dialog defaulting to the original file location and name. If you're overwriting an existing file, a `.bak` backup is automatically created first.

> **Important:** Make sure the game is fully closed before saving, otherwise it may overwrite your changes when it exits.

## Supported Operating Systems

- **macOS** (Apple Silicon and Intel) — the DMG release is a universal binary that runs natively on both architectures
- Windows and Linux are not currently supported, but you can run from source on any platform that supports Electron

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
