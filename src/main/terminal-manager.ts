import * as pty from 'node-pty';
import { BrowserWindow } from 'electron';
import { idleNotificationManager } from './idle-notification-manager';

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
      env: {
        ...process.env,
        LANG: process.env.LANG || 'en_US.UTF-8',
        LC_ALL: process.env.LC_ALL || 'en_US.UTF-8',
      } as { [key: string]: string },
    });

    ptyProcess.onData((data: string) => {
      try {
        // Check if terminal still exists (may have been destroyed)
        if (!this.terminals.has(id)) return;

        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('terminal:output', id, data);
        }
        idleNotificationManager.recordActivity(id);
      } catch (err) {
        console.error(`[Terminal ${id}] Error processing output:`, err);
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      console.log(`Terminal ${id} exited with code ${exitCode}`);
      idleNotificationManager.unregisterTerminal(id);
      this.terminals.delete(id);
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('terminal:closed', id);
      }
    });

    const terminal: TerminalInfo = {
      id,
      name: name || `Terminal ${this.idCounter}`,
      pty: ptyProcess,
    };

    this.terminals.set(id, terminal);
    idleNotificationManager.registerTerminal(id, terminal.name);
    return id;
  }

  writeToTerminal(id: string, data: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      try {
        terminal.pty.write(data);
        if (data.includes('\r') || data.includes('\n')) {
          idleNotificationManager.markAsActive(id);
        }
      } catch (err) {
        // Terminal may have been destroyed
        console.log(`[Terminal ${id}] write ignored: terminal may be closed`);
      }
    }
  }

  resizeTerminal(id: string, cols: number, rows: number): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      try {
        terminal.pty.resize(cols, rows);
      } catch (err) {
        // Terminal may have been destroyed, ignore resize errors
        console.log(`[Terminal ${id}] resize ignored: terminal may be closed`);
      }
    }
  }

  closeTerminal(id: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      idleNotificationManager.unregisterTerminal(id);
      this.terminals.delete(id);
      try {
        terminal.pty.kill();
      } catch (err) {
        // Terminal may already be destroyed
      }
    }
  }

  renameTerminal(id: string, name: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      terminal.name = name;
      idleNotificationManager.updateTerminalName(id, name);
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
      try {
        terminal.pty.kill();
      } catch (err) {
        // Terminal may already be destroyed
      }
    }
    this.terminals.clear();
  }
}

export const terminalManager = new TerminalManager();
