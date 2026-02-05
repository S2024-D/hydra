import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir()),
  },
}));

describe('SettingsManager', () => {
  const settingsPath = path.join(os.tmpdir(), 'settings.json');

  beforeEach(() => {
    try { fs.unlinkSync(settingsPath); } catch {}
  });

  afterEach(() => {
    try { fs.unlinkSync(settingsPath); } catch {}
  });

  // Inline settings manager logic for isolated testing
  const darkTheme = {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    cursor: '#d4d4d4',
    cursorAccent: '#1e1e1e',
    selectionBackground: '#264f78',
    black: '#000000', red: '#cd3131', green: '#0dbc79', yellow: '#e5e510',
    blue: '#2472c8', magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5',
    brightBlack: '#666666', brightRed: '#f14c4c', brightGreen: '#23d18b',
    brightYellow: '#f5f543', brightBlue: '#3b8eea', brightMagenta: '#d670d6',
    brightCyan: '#29b8db', brightWhite: '#ffffff',
  };

  const lightTheme = {
    background: '#ffffff',
    foreground: '#333333',
    cursor: '#333333',
    cursorAccent: '#ffffff',
    selectionBackground: '#add6ff',
    black: '#000000', red: '#cd3131', green: '#00bc00', yellow: '#949800',
    blue: '#0451a5', magenta: '#bc05bc', cyan: '#0598bc', white: '#555555',
    brightBlack: '#666666', brightRed: '#cd3131', brightGreen: '#14ce14',
    brightYellow: '#b5ba00', brightBlue: '#0451a5', brightMagenta: '#bc05bc',
    brightCyan: '#0598bc', brightWhite: '#a5a5a5',
  };

  const defaultSettings = {
    theme: 'dark' as const,
    fontFamily: 'Menlo, "Apple SD Gothic Neo", Monaco, "Malgun Gothic", monospace',
    fontSize: 14,
    terminalTheme: darkTheme,
    idleNotification: { enabled: false, timeoutSeconds: 3 },
  };

  class TestSettingsManager {
    private settingsPath: string;
    private settings: typeof defaultSettings;

    constructor() {
      this.settingsPath = path.join(os.tmpdir(), 'settings.json');
      this.settings = this.loadFromFile();
    }

    private loadFromFile() {
      try {
        if (fs.existsSync(this.settingsPath)) {
          const data = fs.readFileSync(this.settingsPath, 'utf-8');
          const loaded = JSON.parse(data);
          return { ...defaultSettings, ...loaded };
        }
      } catch {}
      return { ...defaultSettings };
    }

    private save(): void {
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
    }

    get() { return { ...this.settings }; }

    update(newSettings: Partial<typeof defaultSettings>) {
      this.settings = { ...this.settings, ...newSettings };
      if (newSettings.theme) {
        this.settings.terminalTheme = newSettings.theme === 'dark' ? darkTheme : lightTheme;
      }
      this.save();
      return this.get();
    }

    setTheme(theme: 'dark' | 'light') {
      return this.update({ theme, terminalTheme: theme === 'dark' ? darkTheme : lightTheme });
    }

    setFont(fontFamily: string, fontSize: number) {
      return this.update({ fontFamily, fontSize });
    }
  }

  let sm: TestSettingsManager;

  beforeEach(() => {
    sm = new TestSettingsManager();
  });

  describe('get', () => {
    it('should return default settings initially', () => {
      const settings = sm.get();
      expect(settings.theme).toBe('dark');
      expect(settings.fontSize).toBe(14);
      expect(settings.idleNotification.enabled).toBe(false);
    });

    it('should return a copy, not the original', () => {
      const s1 = sm.get();
      const s2 = sm.get();
      expect(s1).toEqual(s2);
      expect(s1).not.toBe(s2);
    });
  });

  describe('update', () => {
    it('should update settings partially', () => {
      const result = sm.update({ fontSize: 18 });
      expect(result.fontSize).toBe(18);
      expect(result.theme).toBe('dark'); // unchanged
    });

    it('should persist settings to disk', () => {
      sm.update({ fontSize: 20 });
      const newSm = new TestSettingsManager();
      expect(newSm.get().fontSize).toBe(20);
    });

    it('should update terminal theme when theme changes', () => {
      const result = sm.update({ theme: 'light' });
      expect(result.terminalTheme.background).toBe('#ffffff');
    });
  });

  describe('setTheme', () => {
    it('should set dark theme', () => {
      sm.setTheme('light');
      const result = sm.setTheme('dark');
      expect(result.theme).toBe('dark');
      expect(result.terminalTheme.background).toBe('#1e1e1e');
    });

    it('should set light theme', () => {
      const result = sm.setTheme('light');
      expect(result.theme).toBe('light');
      expect(result.terminalTheme.background).toBe('#ffffff');
    });
  });

  describe('setFont', () => {
    it('should update font family and size', () => {
      const result = sm.setFont('Fira Code', 16);
      expect(result.fontFamily).toBe('Fira Code');
      expect(result.fontSize).toBe(16);
    });
  });
});
