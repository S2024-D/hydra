import { Notification, BrowserWindow } from 'electron';
import { settingsManager } from './settings-manager';

interface TerminalActivityState {
  terminalId: string;
  terminalName: string;
  projectName: string | null;
  timer: NodeJS.Timeout | null;
  lastActivityTime: number;
  notificationSent: boolean;
  isActive: boolean;
  needsAttention: boolean;
}

export class IdleNotificationManager {
  private activityStates: Map<string, TerminalActivityState> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private activeTerminalId: string | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  setActiveTerminal(id: string | null): void {
    this.activeTerminalId = id;
  }

  registerTerminal(id: string, name: string, projectName: string | null = null): void {
    this.activityStates.set(id, {
      terminalId: id,
      terminalName: name,
      projectName,
      timer: null,
      lastActivityTime: Date.now(),
      notificationSent: false,
      isActive: false,
      needsAttention: false,
    });
  }

  unregisterTerminal(id: string): void {
    const state = this.activityStates.get(id);
    if (state?.timer) {
      clearTimeout(state.timer);
    }
    this.activityStates.delete(id);
  }

  updateTerminalName(id: string, name: string): void {
    const state = this.activityStates.get(id);
    if (state) {
      state.terminalName = name;
    }
  }

  updateTerminalProject(id: string, projectName: string | null): void {
    const state = this.activityStates.get(id);
    if (state) {
      state.projectName = projectName;
    }
  }

  recordActivity(id: string): void {
    const settings = settingsManager.get();
    if (!settings.idleNotification.enabled) return;

    const state = this.activityStates.get(id);
    if (!state) return;

    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }

    if (state.notificationSent) {
      state.notificationSent = false;
    }

    // Clear attention state when activity resumes
    if (state.needsAttention) {
      state.needsAttention = false;
      this.notifyAttentionChange();
    }

    state.lastActivityTime = Date.now();
    state.isActive = true;

    const timeoutMs = settings.idleNotification.timeoutSeconds * 1000;
    state.timer = setTimeout(() => {
      this.onIdleTimeout(id);
    }, timeoutMs);
  }

  private onIdleTimeout(id: string): void {
    const state = this.activityStates.get(id);
    if (!state || state.notificationSent || !state.isActive) return;

    const settings = settingsManager.get();
    if (!settings.idleNotification.enabled) return;

    // Skip notification if this terminal is currently active
    if (this.activeTerminalId === id) {
      return;
    }

    // Skip notification if app window is focused and this terminal is active
    if (this.mainWindow?.isFocused() && this.activeTerminalId === id) {
      return;
    }

    state.notificationSent = true;
    state.isActive = false;
    state.timer = null;

    this.showNotification(id);
  }

  private showNotification(terminalId: string): void {
    const state = this.activityStates.get(terminalId);
    if (!state) return;

    state.needsAttention = true;
    this.notifyAttentionChange();

    const displayName = state.projectName
      ? `${state.projectName} - ${state.terminalName}`
      : state.terminalName;

    const notification = new Notification({
      title: 'Hydra',
      body: `${displayName} 확인해주세요.`,
      silent: false,
    });

    notification.on('click', () => {
      if (this.mainWindow) {
        this.mainWindow.show();
        this.mainWindow.focus();
        this.mainWindow.webContents.send('terminal:focus', terminalId);
      }
    });

    notification.show();
  }

  private notifyAttentionChange(): void {
    if (this.mainWindow) {
      const attentionList = this.getAttentionTerminals();
      this.mainWindow.webContents.send('terminal:attentionChange', attentionList);
    }
  }

  getAttentionTerminals(): string[] {
    return Array.from(this.activityStates.values())
      .filter(state => state.needsAttention)
      .map(state => state.terminalId);
  }

  clearAttention(id: string): void {
    const state = this.activityStates.get(id);
    if (state && state.needsAttention) {
      state.needsAttention = false;
      this.notifyAttentionChange();
    }
  }

  markAsActive(id: string): void {
    const state = this.activityStates.get(id);
    if (state) {
      state.isActive = true;
      state.notificationSent = false;
    }
  }

  cleanup(): void {
    for (const state of this.activityStates.values()) {
      if (state.timer) {
        clearTimeout(state.timer);
      }
    }
    this.activityStates.clear();
  }
}

export const idleNotificationManager = new IdleNotificationManager();
