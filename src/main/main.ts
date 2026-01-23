import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { terminalManager } from './terminal-manager';
import { projectManager, Project } from './project-manager';
import { sessionManager, SessionData } from './session-manager';
import { settingsManager, Settings } from './settings-manager';

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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
