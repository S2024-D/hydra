import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { terminalManager } from './terminal-manager';
import { projectManager, Project } from './project-manager';
import { sessionManager, SessionData } from './session-manager';
import { settingsManager, Settings } from './settings-manager';
import { idleNotificationManager } from './idle-notification-manager';
import { attachmentManager, Attachment } from './attachment-manager';
import { claudeSettingsManager, FlattenedHook, HookConfig } from './claude-settings-manager';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Open DevTools in development (uncomment if needed)
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  terminalManager.setMainWindow(mainWindow);
  idleNotificationManager.setMainWindow(mainWindow);
}

// IPC handlers for terminal management
ipcMain.handle('terminal:create', (_event, name?: string, cwd?: string) => {
  return terminalManager.createTerminal(name, cwd);
});

ipcMain.on('terminal:input', (_event, id: string, data: string) => {
  terminalManager.writeToTerminal(id, data);
});

ipcMain.on('terminal:resize', (_event, id: string, cols: number, rows: number) => {
  terminalManager.resizeTerminal(id, cols, rows);
});

ipcMain.on('terminal:close', (_event, id: string) => {
  terminalManager.closeTerminal(id);
});

ipcMain.handle('terminal:list', () => {
  return terminalManager.getTerminalList();
});

ipcMain.on('terminal:rename', (_event, id: string, name: string) => {
  terminalManager.renameTerminal(id, name);
});

// IPC handlers for project management
ipcMain.handle('project:add', async (): Promise<Project | null> => {
  return projectManager.addProject();
});

ipcMain.handle('project:remove', (_event, id: string): boolean => {
  return projectManager.removeProject(id);
});

ipcMain.handle('project:list', (): Project[] => {
  return projectManager.getAllProjects();
});

ipcMain.handle('project:getActive', (): Project | null => {
  return projectManager.getActiveProject();
});

ipcMain.handle('project:setActive', (_event, id: string): boolean => {
  return projectManager.setActiveProject(id);
});

ipcMain.on('project:addTerminal', (_event, projectId: string, terminalId: string) => {
  projectManager.addTerminalToProject(projectId, terminalId);
});

ipcMain.on('project:removeTerminal', (_event, projectId: string, terminalId: string) => {
  projectManager.removeTerminalFromProject(projectId, terminalId);
});

// Session management
ipcMain.handle('session:load', (): SessionData | null => {
  return sessionManager.load();
});

ipcMain.on('session:save', (_event, data: SessionData) => {
  sessionManager.save(data);
});

// Settings management
ipcMain.handle('settings:get', (): Settings => {
  return settingsManager.get();
});

ipcMain.handle('settings:update', (_event, newSettings: Partial<Settings>): Settings => {
  return settingsManager.update(newSettings);
});

ipcMain.handle('settings:setTheme', (_event, theme: 'dark' | 'light'): Settings => {
  return settingsManager.setTheme(theme);
});

ipcMain.handle('settings:setFont', (_event, fontFamily: string, fontSize: number): Settings => {
  return settingsManager.setFont(fontFamily, fontSize);
});

// Idle notification settings
ipcMain.handle('settings:setIdleNotification', (_event, enabled: boolean, timeoutSeconds?: number): Settings => {
  const current = settingsManager.get();
  return settingsManager.update({
    idleNotification: {
      enabled,
      timeoutSeconds: timeoutSeconds ?? current.idleNotification.timeoutSeconds,
    },
  });
});

// Active terminal tracking for idle notification
ipcMain.on('terminal:setActive', (_event, id: string | null) => {
  idleNotificationManager.setActiveTerminal(id);
  if (id) {
    idleNotificationManager.clearAttention(id);
  }
});

// Get terminals needing attention
ipcMain.handle('terminal:getAttentionList', () => {
  return idleNotificationManager.getAttentionTerminals();
});

// Update terminal project info for notification
ipcMain.on('terminal:updateProject', (_event, id: string, projectName: string | null) => {
  idleNotificationManager.updateTerminalProject(id, projectName);
});

// Attachment management
ipcMain.handle('attachment:selectImage', async (): Promise<{ filePath: string } | null> => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return { filePath: result.filePaths[0] };
});

ipcMain.handle('attachment:add', (_event, filePath: string, title?: string, linkedProjectId?: string): Attachment => {
  return attachmentManager.addAttachment(filePath, title, linkedProjectId);
});

ipcMain.handle('attachment:remove', (_event, id: string): boolean => {
  return attachmentManager.removeAttachment(id);
});

ipcMain.handle('attachment:update', (_event, id: string, updates: { title?: string; linkedProjectId?: string }): Attachment | null => {
  return attachmentManager.updateAttachment(id, updates);
});

ipcMain.handle('attachment:list', (): Attachment[] => {
  return attachmentManager.getAttachments();
});

ipcMain.handle('attachment:checkFileExists', (_event, filePath: string): boolean => {
  return attachmentManager.checkFileExists(filePath);
});

ipcMain.handle('attachment:readImageAsBase64', (_event, filePath: string): string | null => {
  return attachmentManager.readImageAsBase64(filePath);
});

// Claude Code hooks management
ipcMain.handle('claude:getHooks', (): FlattenedHook[] => {
  return claudeSettingsManager.getHooks();
});

ipcMain.handle('claude:addHook', (
  _event,
  eventName: string,
  matcher: string | undefined,
  hookConfig: HookConfig
): FlattenedHook[] => {
  return claudeSettingsManager.addHook(eventName, matcher, hookConfig);
});

ipcMain.handle('claude:updateHook', (
  _event,
  eventName: string,
  entryIndex: number,
  hookIndex: number,
  newMatcher: string | undefined,
  hookConfig: HookConfig
): FlattenedHook[] => {
  return claudeSettingsManager.updateHook(eventName, entryIndex, hookIndex, newMatcher, hookConfig);
});

ipcMain.handle('claude:removeHook', (
  _event,
  eventName: string,
  entryIndex: number,
  hookIndex: number
): FlattenedHook[] => {
  return claudeSettingsManager.removeHook(eventName, entryIndex, hookIndex);
});

ipcMain.handle('claude:getSettingsPath', (): string => {
  return claudeSettingsManager.getFilePath();
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  terminalManager.closeAll();
  idleNotificationManager.cleanup();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
