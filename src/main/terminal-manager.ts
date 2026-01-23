import * as pty from 'node-pty';
import { BrowserWindow } from 'electron';

export interface TerminalInfo {
  id: string;
  name: string;
  pty: pty.IPty;
}

export class TerminalManager {
  private terminals: Map<string, TerminalInfo> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private idCounter = 0;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  createTerminal(name?: string, cwd?: string): string {
    const id = `terminal-${++this.idCounter}`;
    const shell = process.env.SHELL || '/bin/zsh';

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd || process.env.HOME,
      env: process.env as { [key: string]: string },
    });

    ptyProcess.onData((data: string) => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send('terminal:output', id, data);
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      console.log(`Terminal ${id} exited with code ${exitCode}`);
      this.terminals.delete(id);
      if (this.mainWindow) {
        this.mainWindow.webContents.send('terminal:closed', id);
      }
    });

    const terminal: TerminalInfo = {
      id,
      name: name || `Terminal ${this.idCounter}`,
      pty: ptyProcess,
    };

    this.terminals.set(id, terminal);
    return id;
  }

  writeToTerminal(id: string, data: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      terminal.pty.write(data);
    }
  }

  resizeTerminal(id: string, cols: number, rows: number): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      terminal.pty.resize(cols, rows);
    }
  }

  closeTerminal(id: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      terminal.pty.kill();
      this.terminals.delete(id);
    }
  }

  renameTerminal(id: string, name: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      terminal.name = name;
    }
  }

  getTerminalList(): { id: string; name: string }[] {
    return Array.from(this.terminals.values()).map((t) => ({
      id: t.id,
      name: t.name,
    }));
  }

  closeAll(): void {
    for (const terminal of this.terminals.values()) {
      terminal.pty.kill();
    }
    this.terminals.clear();
  }
}

export const terminalManager = new TerminalManager();
