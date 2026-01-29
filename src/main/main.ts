import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import * as path from 'path';
import { terminalManager } from './terminal-manager';
import { projectManager, Project } from './project-manager';
import { sessionManager, SessionData } from './session-manager';
import { settingsManager, Settings } from './settings-manager';
import { idleNotificationManager } from './idle-notification-manager';
import { attachmentManager, Attachment } from './attachment-manager';
import { claudeSettingsManager, FlattenedHook, HookConfig } from './claude-settings-manager';
import { mcpManager, MCPServerTemplate, MCPServerSchema } from './mcp-manager';
import { orchestratorManager, AgentRole, WorkflowConfig } from './orchestrator-manager';
import { gatewayManager, GatewayStatus } from './hydra-gateway';

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

  // Open DevTools in development
  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  terminalManager.setMainWindow(mainWindow);
  idleNotificationManager.setMainWindow(mainWindow);
}

function createMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    // App Menu (macOS only)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        {
          label: 'Settings...',
          accelerator: 'Cmd+,',
          click: () => {
            mainWindow?.webContents.send('menu:openSettings');
          }
        },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const }
      ]
    }] : []),

    // File Menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New Terminal',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            mainWindow?.webContents.send('menu:newTerminal');
          }
        },
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => {
            mainWindow?.webContents.send('menu:newProject');
          }
        },
        { type: 'separator' },
        {
          label: 'Close Terminal',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            mainWindow?.webContents.send('menu:closeTerminal');
          }
        },
        ...(isMac ? [] : [
          { type: 'separator' as const },
          {
            label: 'Settings',
            accelerator: 'Ctrl+,',
            click: () => {
              mainWindow?.webContents.send('menu:openSettings');
            }
          },
          { type: 'separator' as const },
          { role: 'quit' as const }
        ])
      ]
    },

    // Edit Menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },

    // View Menu
    {
      label: 'View',
      submenu: [
        {
          label: 'Command Palette',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => {
            mainWindow?.webContents.send('menu:commandPalette');
          }
        },
        { type: 'separator' },
        {
          label: 'Split Right',
          accelerator: 'CmdOrCtrl+\\',
          click: () => {
            mainWindow?.webContents.send('menu:splitRight');
          }
        },
        {
          label: 'Split Down',
          accelerator: 'CmdOrCtrl+Shift+\\',
          click: () => {
            mainWindow?.webContents.send('menu:splitDown');
          }
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },

    // Window Menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const }
        ] : [
          { role: 'close' as const }
        ])
      ]
    },

    // Help Menu
    {
      label: 'Help',
      submenu: [
        {
          label: 'Keyboard Shortcuts',
          click: () => {
            mainWindow?.webContents.send('menu:openSettings');
          }
        },
        { type: 'separator' },
        {
          label: 'GitHub Repository',
          click: () => {
            shell.openExternal('https://github.com');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
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


// MCP Server management
ipcMain.handle('mcp:getServers', (): MCPServerTemplate[] => {
  return mcpManager.getServers();
});

ipcMain.handle('mcp:addServer', (_event, server: Omit<MCPServerTemplate, 'id'>): MCPServerTemplate => {
  return mcpManager.addServer(server);
});

ipcMain.handle('mcp:updateServer', (_event, id: string, updates: Partial<Omit<MCPServerTemplate, 'id'>>): MCPServerTemplate | null => {
  return mcpManager.updateServer(id, updates);
});

ipcMain.handle('mcp:removeServer', (_event, id: string): boolean => {
  return mcpManager.removeServer(id);
});

ipcMain.handle('mcp:toggleServer', (_event, id: string): MCPServerTemplate | null => {
  return mcpManager.toggleServer(id);
});

ipcMain.handle('mcp:getTemplates', () => {
  return mcpManager.getTemplates();
});

ipcMain.handle('mcp:importSchemaFromUrl', async (_event, url: string): Promise<MCPServerSchema> => {
  return mcpManager.importFromUrl(url);
});

ipcMain.handle('mcp:importSchemaFromFile', async (): Promise<MCPServerSchema | null> => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return mcpManager.importFromFile(result.filePaths[0]);
});

ipcMain.handle('mcp:addServerFromSchema', (_event, schema: MCPServerSchema, settings: Record<string, unknown>): MCPServerTemplate => {
  return mcpManager.addServerFromSchema(schema, settings);
});

// Orchestrator management
ipcMain.handle('orchestrator:getAgents', (): AgentRole[] => {
  return orchestratorManager.getAgents();
});

ipcMain.handle('orchestrator:getWorkflows', (): WorkflowConfig[] => {
  return orchestratorManager.getWorkflows();
});

ipcMain.handle('orchestrator:getWorkflow', (_event, id: string): WorkflowConfig | null => {
  return orchestratorManager.getWorkflow(id);
});

ipcMain.handle('orchestrator:createWorkflow', (_event, task: string, includeDesignReview: boolean): WorkflowConfig => {
  return orchestratorManager.createWorkflow(task, includeDesignReview);
});

ipcMain.handle('orchestrator:runStep', async (_event, workflowId: string): Promise<WorkflowConfig | null> => {
  return orchestratorManager.runStep(workflowId);
});

ipcMain.handle('orchestrator:runAllSteps', async (_event, workflowId: string): Promise<WorkflowConfig | null> => {
  return orchestratorManager.runAllSteps(workflowId);
});

ipcMain.handle('orchestrator:approveWorkflow', (_event, workflowId: string): WorkflowConfig | null => {
  return orchestratorManager.approveWorkflow(workflowId);
});

ipcMain.handle('orchestrator:rejectWorkflow', (_event, workflowId: string, feedback: string): WorkflowConfig | null => {
  return orchestratorManager.rejectWorkflow(workflowId, feedback);
});

ipcMain.handle('orchestrator:deleteWorkflow', (_event, workflowId: string): boolean => {
  return orchestratorManager.deleteWorkflow(workflowId);
});

ipcMain.handle('orchestrator:resetWorkflow', (_event, workflowId: string): WorkflowConfig | null => {
  return orchestratorManager.resetWorkflow(workflowId);
});

// Hydra Gateway management
ipcMain.handle('hydra:start', async (): Promise<GatewayStatus> => {
  return gatewayManager.start();
});

ipcMain.handle('hydra:stop', async (): Promise<void> => {
  return gatewayManager.stop();
});

ipcMain.handle('hydra:refresh', async (): Promise<GatewayStatus> => {
  return gatewayManager.refresh();
});

ipcMain.handle('hydra:getStatus', (): GatewayStatus => {
  return gatewayManager.getStatus();
});

ipcMain.handle('hydra:getTools', (): Array<{ name: string; serverName: string; description?: string }> => {
  return gatewayManager.getTools();
});

ipcMain.handle('hydra:setPort', (_event, port: number): void => {
  gatewayManager.setPort(port);
});

// Forward gateway events to renderer
gatewayManager.on('started', (status: GatewayStatus) => {
  if (mainWindow) {
    mainWindow.webContents.send('hydra:statusChange', status);
  }
});

gatewayManager.on('stopped', () => {
  if (mainWindow) {
    mainWindow.webContents.send('hydra:statusChange', gatewayManager.getStatus());
  }
});

gatewayManager.on('serverStateChange', (data: { serverId: string; serverName: string; status: string; error?: string }) => {
  if (mainWindow) {
    mainWindow.webContents.send('hydra:serverStateChange', data);
  }
});

app.whenReady().then(() => {
  createMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  terminalManager.closeAll();
  idleNotificationManager.cleanup();
  await gatewayManager.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
