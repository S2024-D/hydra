# Hydra

Multi-terminal manager for AI agents. Built with Electron.

## Features

- Multi-panel split terminal layout
- Tab navigation mode (Cmd+Shift+J)
- MCP (Model Context Protocol) integration
- Hydra Gateway with tool registry
- Session persistence across project switches
- Idle notification management

## Quick Install (macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/S2024-D/hydra/master/install.sh | bash
```

This script automatically installs all dependencies (Xcode CLI Tools, Homebrew, Node.js, Python 3) and builds the project.

## Manual Install

```bash
git clone https://github.com/S2024-D/hydra.git
cd hydra
npm install
npx @electron/rebuild
npm run build && npm run copy:html
```

## Usage

```bash
cd ~/hydra
npm start
```

## Build Distributable

```bash
npm run dist:mac     # macOS (dmg, zip)
npm run dist:win     # Windows (nsis, portable)
npm run dist:linux   # Linux (AppImage, deb)
```

## Development

```bash
npm run dev          # Build and launch
npm test             # Run tests
npm run test:watch   # Run tests in watch mode
```

## Tech Stack

- Electron
- TypeScript
- xterm.js (terminal emulation)
- node-pty (pseudo-terminal)
- Vitest (testing)

## License

MIT
