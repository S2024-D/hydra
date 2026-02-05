import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  Notification: vi.fn().mockImplementation(() => ({
    show: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
  })),
  app: {
    getPath: vi.fn(() => '/tmp'),
  },
}));

// Mock settings-manager
vi.mock('../src/main/settings-manager', () => ({
  settingsManager: {
    get: vi.fn(() => ({
      idleNotification: { enabled: false, timeoutSeconds: 3 },
    })),
  },
}));

// Mock node-pty
const mockPtyProcess = {
  onData: vi.fn(),
  onExit: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
  pid: 1234,
};

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => mockPtyProcess),
}));

// Mock idle-notification-manager
vi.mock('../src/main/idle-notification-manager', () => ({
  idleNotificationManager: {
    registerTerminal: vi.fn(),
    unregisterTerminal: vi.fn(),
    recordActivity: vi.fn(),
    markAsActive: vi.fn(),
    updateTerminalName: vi.fn(),
    setMainWindow: vi.fn(),
    cleanup: vi.fn(),
  },
}));

import { TerminalManager } from '../src/main/terminal-manager';
import { idleNotificationManager } from '../src/main/idle-notification-manager';

describe('TerminalManager', () => {
  let tm: TerminalManager;

  beforeEach(() => {
    vi.clearAllMocks();
    tm = new TerminalManager();
    mockPtyProcess.onData.mockReset();
    mockPtyProcess.onExit.mockReset();
  });

  describe('createTerminal', () => {
    it('should create a terminal and return its id', () => {
      const id = tm.createTerminal('Test Terminal');
      expect(id).toMatch(/^terminal-/);
    });

    it('should register terminal with idle notification manager', () => {
      const id = tm.createTerminal('My Terminal');
      expect(idleNotificationManager.registerTerminal).toHaveBeenCalledWith(id, 'My Terminal');
    });

    it('should use default name if none provided', () => {
      tm.createTerminal();
      expect(idleNotificationManager.registerTerminal).toHaveBeenCalledWith(
        expect.stringMatching(/^terminal-/),
        expect.stringContaining('Terminal')
      );
    });

    it('should add terminal to the list', () => {
      tm.createTerminal('T1');
      tm.createTerminal('T2');
      const list = tm.getTerminalList();
      expect(list).toHaveLength(2);
    });
  });

  describe('getTerminalList', () => {
    it('should return empty list initially', () => {
      expect(tm.getTerminalList()).toEqual([]);
    });

    it('should return all terminals', () => {
      tm.createTerminal('A');
      tm.createTerminal('B');
      const list = tm.getTerminalList();
      expect(list).toHaveLength(2);
      expect(list[0].name).toBe('A');
      expect(list[1].name).toBe('B');
    });
  });

  describe('writeToTerminal', () => {
    it('should write data to terminal pty', () => {
      const id = tm.createTerminal('Test');
      tm.writeToTerminal(id, 'hello');
      expect(mockPtyProcess.write).toHaveBeenCalledWith('hello');
    });

    it('should mark as active when Enter is pressed', () => {
      const id = tm.createTerminal('Test');
      tm.writeToTerminal(id, 'command\r');
      expect(idleNotificationManager.markAsActive).toHaveBeenCalledWith(id);
    });

    it('should ignore writes to non-existent terminals', () => {
      tm.writeToTerminal('nonexistent', 'data');
      expect(mockPtyProcess.write).not.toHaveBeenCalled();
    });
  });

  describe('resizeTerminal', () => {
    it('should resize terminal pty', () => {
      const id = tm.createTerminal('Test');
      tm.resizeTerminal(id, 120, 40);
      expect(mockPtyProcess.resize).toHaveBeenCalledWith(120, 40);
    });

    it('should ignore resize for non-existent terminals', () => {
      tm.resizeTerminal('nonexistent', 80, 24);
      expect(mockPtyProcess.resize).not.toHaveBeenCalled();
    });
  });

  describe('closeTerminal', () => {
    it('should unregister from idle notification', () => {
      const id = tm.createTerminal('Test');
      tm.closeTerminal(id);
      expect(idleNotificationManager.unregisterTerminal).toHaveBeenCalledWith(id);
    });

    it('should remove terminal from list', () => {
      const id = tm.createTerminal('Test');
      tm.closeTerminal(id);
      expect(tm.getTerminalList()).toHaveLength(0);
    });

    it('should kill pty process', () => {
      const id = tm.createTerminal('Test');
      tm.closeTerminal(id);
      expect(mockPtyProcess.kill).toHaveBeenCalled();
    });
  });

  describe('renameTerminal', () => {
    it('should update terminal name', () => {
      const id = tm.createTerminal('Old Name');
      tm.renameTerminal(id, 'New Name');
      const list = tm.getTerminalList();
      expect(list[0].name).toBe('New Name');
    });

    it('should update name in idle notification manager', () => {
      const id = tm.createTerminal('Old');
      tm.renameTerminal(id, 'New');
      expect(idleNotificationManager.updateTerminalName).toHaveBeenCalledWith(id, 'New');
    });
  });

  describe('closeAll', () => {
    it('should close all terminals', () => {
      tm.createTerminal('A');
      tm.createTerminal('B');
      tm.closeAll();
      expect(tm.getTerminalList()).toHaveLength(0);
    });
  });
});
