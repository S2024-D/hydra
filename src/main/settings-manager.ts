import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface IdleNotificationSettings {
  enabled: boolean;
  timeoutSeconds: number;
}

export interface Settings {
  theme: 'dark' | 'light';
  fontFamily: string;
  fontSize: number;
  terminalTheme: TerminalTheme;
  idleNotification: IdleNotificationSettings;
}

const darkTheme: TerminalTheme = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  cursorAccent: '#1e1e1e',
  selectionBackground: '#264f78',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
};

const lightTheme: TerminalTheme = {
  background: '#ffffff',
  foreground: '#333333',
  cursor: '#333333',
  cursorAccent: '#ffffff',
  selectionBackground: '#add6ff',
  black: '#000000',
  red: '#cd3131',
  green: '#00bc00',
  yellow: '#949800',
  blue: '#0451a5',
  magenta: '#bc05bc',
  cyan: '#0598bc',
  white: '#555555',
  brightBlack: '#666666',
  brightRed: '#cd3131',
  brightGreen: '#14ce14',
  brightYellow: '#b5ba00',
  brightBlue: '#0451a5',
  brightMagenta: '#bc05bc',
  brightCyan: '#0598bc',
  brightWhite: '#a5a5a5',
};

const defaultSettings: Settings = {
  theme: 'dark',
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  fontSize: 14,
  terminalTheme: darkTheme,
  idleNotification: {
    enabled: false,
    timeoutSeconds: 3,
  },
};

class SettingsManager {
  private settingsPath: string;
  private settings: Settings;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.settingsPath = path.join(userDataPath, 'settings.json');
    this.settings = this.load();
  }

  private load(): Settings {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf-8');
        const loaded = JSON.parse(data);
        return { ...defaultSettings, ...loaded };
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
    return { ...defaultSettings };
  }

  save(): void {
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  get(): Settings {
    return { ...this.settings };
  }

  update(newSettings: Partial<Settings>): Settings {
    this.settings = { ...this.settings, ...newSettings };

    // Update terminal theme based on theme setting
    if (newSettings.theme) {
      this.settings.terminalTheme = newSettings.theme === 'dark' ? darkTheme : lightTheme;
    }

    this.save();
    return this.get();
  }

  setTheme(theme: 'dark' | 'light'): Settings {
    return this.update({ theme, terminalTheme: theme === 'dark' ? darkTheme : lightTheme });
  }

  setFont(fontFamily: string, fontSize: number): Settings {
    return this.update({ fontFamily, fontSize });
  }
}

export const settingsManager = new SettingsManager();
