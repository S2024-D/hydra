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

describe('SessionManager', () => {
  const sessionPath = path.join(os.tmpdir(), 'session.json');

  beforeEach(() => {
    // Clean up before each test
    try { fs.unlinkSync(sessionPath); } catch {}
  });

  afterEach(() => {
    try { fs.unlinkSync(sessionPath); } catch {}
  });

  // Inline the session manager logic for testing
  class TestSessionManager {
    private sessionPath: string;

    constructor() {
      this.sessionPath = path.join(os.tmpdir(), 'session.json');
    }

    save(data: any): void {
      try {
        fs.writeFileSync(this.sessionPath, JSON.stringify(data, null, 2));
      } catch (error) {
        console.error('Failed to save session:', error);
      }
    }

    load(): any | null {
      try {
        if (fs.existsSync(this.sessionPath)) {
          const data = fs.readFileSync(this.sessionPath, 'utf-8');
          return JSON.parse(data);
        }
      } catch (error) {
        console.error('Failed to load session:', error);
      }
      return null;
    }

    clear(): void {
      try {
        if (fs.existsSync(this.sessionPath)) {
          fs.unlinkSync(this.sessionPath);
        }
      } catch (error) {
        console.error('Failed to clear session:', error);
      }
    }
  }

  let sm: TestSessionManager;

  beforeEach(() => {
    sm = new TestSessionManager();
  });

  describe('save', () => {
    it('should save session data to file', () => {
      const data = {
        terminals: [{ id: 't1', name: 'Terminal 1', cwd: '/home', projectId: null }],
        projects: [],
        activeTerminalId: 't1',
        activeProjectId: null,
      };
      sm.save(data);
      expect(fs.existsSync(sessionPath)).toBe(true);
    });
  });

  describe('load', () => {
    it('should load saved session data', () => {
      const data = {
        terminals: [{ id: 't1', name: 'Terminal 1', cwd: '/home', projectId: null }],
        projects: [],
        activeTerminalId: 't1',
        activeProjectId: null,
      };
      sm.save(data);
      const loaded = sm.load();
      expect(loaded).toEqual(data);
    });

    it('should return null when no session exists', () => {
      const loaded = sm.load();
      expect(loaded).toBeNull();
    });

    it('should return null for corrupted data', () => {
      fs.writeFileSync(sessionPath, 'not valid json{{{');
      const loaded = sm.load();
      expect(loaded).toBeNull();
    });
  });

  describe('clear', () => {
    it('should remove session file', () => {
      sm.save({ terminals: [], projects: [], activeTerminalId: null, activeProjectId: null });
      sm.clear();
      expect(fs.existsSync(sessionPath)).toBe(false);
    });

    it('should not throw when no session file exists', () => {
      expect(() => sm.clear()).not.toThrow();
    });
  });

  describe('round-trip', () => {
    it('should preserve complex session data', () => {
      const data = {
        terminals: [
          { id: 't1', name: 'Dev', cwd: '/projects/app', projectId: 'p1' },
          { id: 't2', name: 'Test', cwd: '/projects/app', projectId: 'p1' },
        ],
        projects: [
          { id: 'p1', name: 'My App', path: '/projects/app', terminalIds: ['t1', 't2'] },
        ],
        activeTerminalId: 't1',
        activeProjectId: 'p1',
      };
      sm.save(data);
      const loaded = sm.load();
      expect(loaded).toEqual(data);
      expect(loaded.terminals).toHaveLength(2);
      expect(loaded.projects[0].terminalIds).toEqual(['t1', 't2']);
    });
  });
});
