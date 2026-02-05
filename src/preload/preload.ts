import { contextBridge, ipcRenderer, webUtils } from 'electron';

export interface Project {
  id: string;
  name: string;
  path: string;
  terminalIds: string[];
}

export interface SessionData {
  terminals: Array<{ id: string; name: string; projectId?: string }>;
  activeTerminalId?: string;
  timestamp?: number;
}

export interface Settings {
  theme: 'dark' | 'light';
  fontFamily: string;
  fontSize: number;
  terminalTheme: Record<string, string>;
  idleNotification: { enabled: boolean; timeoutSeconds: number };
}

export interface Attachment {
  id: string;
  path: string;
  title?: string;
  linkedProjectId?: string;
  timestamp: number;
}

export interface HookConfig {
  type: 'command' | 'prompt';
  command?: string;
  prompt?: string;
  timeout?: number;
}

export interface FlattenedHook {
  id: string;
  eventName: string;
  entryIndex: number;
  hookIndex: number;
  matcher?: string;
  hookConfig: HookConfig;
}

export interface MCPServerTemplate {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  settings?: Record<string, unknown>;
  custom?: { command: string; args: string[]; env: Record<string, string> };
  importedSchema?: MCPServerSchema;
}

export interface MCPServerSchema {
  name: string;
  description?: string;
  icon?: string;
  command: string;
  args: string[];
  fields: Array<{ key: string; label: string; type: string; placeholder?: string; required?: boolean; default?: string | boolean | number; helpText?: string; helpUrl?: string }>;
  envMapping: Record<string, string>;
}

export interface MCPTemplateDefinition {
  name: string;
  icon: string;
  command: string;
  args: string[];
  fields: Array<{ key: string; label: string; type: string; placeholder?: string }>;
}

export interface AgentRole {
  id: string;
  name: string;
  description: string;
}

export interface WorkflowConfig {
  id: string;
  task: string;
  status: string;
  steps: Array<{ agent: string; status: string; output?: string }>;
}

export interface GatewayStatus {
  running: boolean;
  port: number;
  servers: Array<{ id: string; name: string; status: string; error?: string }>;
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Terminal APIs
  createTerminal: (name?: string, cwd?: string): Promise<string> => {
    return ipcRenderer.invoke('terminal:create', name, cwd);
  },

  sendInput: (id: string, data: string) => {
    ipcRenderer.send('terminal:input', id, data);
  },

  onOutput: (callback: (id: string, data: string) => void) => {
    ipcRenderer.on('terminal:output', (_event, id, data) => {
      callback(id, data);
    });
  },

  onTerminalClosed: (callback: (id: string) => void) => {
    ipcRenderer.on('terminal:closed', (_event, id) => {
      callback(id);
    });
  },

  resize: (id: string, cols: number, rows: number) => {
    ipcRenderer.send('terminal:resize', id, cols, rows);
  },

  closeTerminal: (id: string) => {
    ipcRenderer.send('terminal:close', id);
  },

  getTerminalList: (): Promise<{ id: string; name: string }[]> => {
    return ipcRenderer.invoke('terminal:list');
  },

  renameTerminal: (id: string, name: string) => {
    ipcRenderer.send('terminal:rename', id, name);
  },

  // Project APIs
  addProject: (): Promise<Project | null> => {
    return ipcRenderer.invoke('project:add');
  },

  removeProject: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke('project:remove', id);
  },

  getProjects: (): Promise<Project[]> => {
    return ipcRenderer.invoke('project:list');
  },

  getActiveProject: (): Promise<Project | null> => {
    return ipcRenderer.invoke('project:getActive');
  },

  setActiveProject: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke('project:setActive', id);
  },

  addTerminalToProject: (projectId: string, terminalId: string) => {
    ipcRenderer.send('project:addTerminal', projectId, terminalId);
  },

  removeTerminalFromProject: (projectId: string, terminalId: string) => {
    ipcRenderer.send('project:removeTerminal', projectId, terminalId);
  },

  // Session APIs
  loadSession: (): Promise<SessionData | null> => {
    return ipcRenderer.invoke('session:load');
  },

  saveSession: (data: SessionData) => {
    ipcRenderer.send('session:save', data);
  },

  // Settings APIs
  getSettings: (): Promise<Settings> => {
    return ipcRenderer.invoke('settings:get');
  },

  updateSettings: (settings: Partial<Settings>): Promise<Settings> => {
    return ipcRenderer.invoke('settings:update', settings);
  },

  setTheme: (theme: 'dark' | 'light'): Promise<Settings> => {
    return ipcRenderer.invoke('settings:setTheme', theme);
  },

  setFont: (fontFamily: string, fontSize: number): Promise<Settings> => {
    return ipcRenderer.invoke('settings:setFont', fontFamily, fontSize);
  },

  // Idle notification APIs
  setIdleNotification: (enabled: boolean, timeoutSeconds?: number): Promise<Settings> => {
    return ipcRenderer.invoke('settings:setIdleNotification', enabled, timeoutSeconds);
  },

  setActiveTerminal: (id: string | null) => {
    ipcRenderer.send('terminal:setActive', id);
  },

  onTerminalFocus: (callback: (id: string) => void) => {
    ipcRenderer.on('terminal:focus', (_event, id) => {
      callback(id);
    });
  },

  onAttentionChange: (callback: (terminalIds: string[]) => void) => {
    ipcRenderer.on('terminal:attentionChange', (_event, terminalIds) => {
      callback(terminalIds);
    });
  },

  getAttentionList: (): Promise<string[]> => {
    return ipcRenderer.invoke('terminal:getAttentionList');
  },

  updateTerminalProject: (id: string, projectName: string | null) => {
    ipcRenderer.send('terminal:updateProject', id, projectName);
  },

  // Attachment APIs
  selectImage: (): Promise<{ filePath: string } | null> => {
    return ipcRenderer.invoke('attachment:selectImage');
  },

  addAttachment: (filePath: string, title?: string, linkedProjectId?: string): Promise<Attachment> => {
    return ipcRenderer.invoke('attachment:add', filePath, title, linkedProjectId);
  },

  removeAttachment: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke('attachment:remove', id);
  },

  updateAttachment: (id: string, updates: { title?: string; linkedProjectId?: string }): Promise<Attachment | null> => {
    return ipcRenderer.invoke('attachment:update', id, updates);
  },

  getAttachments: (): Promise<Attachment[]> => {
    return ipcRenderer.invoke('attachment:list');
  },

  checkFileExists: (filePath: string): Promise<boolean> => {
    return ipcRenderer.invoke('attachment:checkFileExists', filePath);
  },

  readImageAsBase64: (filePath: string): Promise<string | null> => {
    return ipcRenderer.invoke('attachment:readImageAsBase64', filePath);
  },

  // Claude Code hooks APIs
  getClaudeHooks: (): Promise<FlattenedHook[]> => {
    return ipcRenderer.invoke('claude:getHooks');
  },

  addClaudeHook: (eventName: string, matcher: string | undefined, hookConfig: HookConfig): Promise<FlattenedHook[]> => {
    return ipcRenderer.invoke('claude:addHook', eventName, matcher, hookConfig);
  },

  updateClaudeHook: (
    eventName: string,
    entryIndex: number,
    hookIndex: number,
    newMatcher: string | undefined,
    hookConfig: HookConfig
  ): Promise<FlattenedHook[]> => {
    return ipcRenderer.invoke('claude:updateHook', eventName, entryIndex, hookIndex, newMatcher, hookConfig);
  },

  removeClaudeHook: (eventName: string, entryIndex: number, hookIndex: number): Promise<FlattenedHook[]> => {
    return ipcRenderer.invoke('claude:removeHook', eventName, entryIndex, hookIndex);
  },

  getClaudeSettingsPath: (): Promise<string> => {
    return ipcRenderer.invoke('claude:getSettingsPath');
  },

  // File drag & drop helper
  getPathForFile: (file: File): string => {
    return webUtils.getPathForFile(file);
  },

  // Menu event listeners
  onMenuOpenSettings: (callback: () => void) => {
    ipcRenderer.on('menu:openSettings', () => callback());
  },

  onMenuNewTerminal: (callback: () => void) => {
    ipcRenderer.on('menu:newTerminal', () => callback());
  },

  onMenuNewProject: (callback: () => void) => {
    ipcRenderer.on('menu:newProject', () => callback());
  },

  onMenuCloseTerminal: (callback: () => void) => {
    ipcRenderer.on('menu:closeTerminal', () => callback());
  },

  onMenuCommandPalette: (callback: () => void) => {
    ipcRenderer.on('menu:commandPalette', () => callback());
  },

  onMenuSplitRight: (callback: () => void) => {
    ipcRenderer.on('menu:splitRight', () => callback());
  },

  onMenuSplitDown: (callback: () => void) => {
    ipcRenderer.on('menu:splitDown', () => callback());
  },


  // MCP Server APIs
  mcpGetServers: (): Promise<MCPServerTemplate[]> => {
    return ipcRenderer.invoke('mcp:getServers');
  },

  mcpAddServer: (server: Omit<MCPServerTemplate, 'id'>): Promise<MCPServerTemplate> => {
    return ipcRenderer.invoke('mcp:addServer', server);
  },

  mcpUpdateServer: (id: string, updates: Partial<Omit<MCPServerTemplate, 'id'>>): Promise<MCPServerTemplate | null> => {
    return ipcRenderer.invoke('mcp:updateServer', id, updates);
  },

  mcpRemoveServer: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke('mcp:removeServer', id);
  },

  mcpToggleServer: (id: string): Promise<MCPServerTemplate | null> => {
    return ipcRenderer.invoke('mcp:toggleServer', id);
  },

  mcpGetTemplates: (): Promise<Record<string, MCPTemplateDefinition>> => {
    return ipcRenderer.invoke('mcp:getTemplates');
  },

  mcpImportSchemaFromUrl: (url: string): Promise<MCPServerSchema> => {
    return ipcRenderer.invoke('mcp:importSchemaFromUrl', url);
  },

  mcpImportSchemaFromFile: (): Promise<MCPServerSchema | null> => {
    return ipcRenderer.invoke('mcp:importSchemaFromFile');
  },

  mcpAddServerFromSchema: (schema: MCPServerSchema, settings: Record<string, unknown>): Promise<MCPServerTemplate> => {
    return ipcRenderer.invoke('mcp:addServerFromSchema', schema, settings);
  },

  // Orchestrator APIs
  orchestratorGetAgents: (): Promise<AgentRole[]> => {
    return ipcRenderer.invoke('orchestrator:getAgents');
  },

  orchestratorGetWorkflows: (): Promise<WorkflowConfig[]> => {
    return ipcRenderer.invoke('orchestrator:getWorkflows');
  },

  orchestratorGetWorkflow: (id: string): Promise<WorkflowConfig | null> => {
    return ipcRenderer.invoke('orchestrator:getWorkflow', id);
  },

  orchestratorCreateWorkflow: (task: string, includeDesignReview: boolean): Promise<WorkflowConfig> => {
    return ipcRenderer.invoke('orchestrator:createWorkflow', task, includeDesignReview);
  },

  orchestratorRunStep: (workflowId: string): Promise<WorkflowConfig | null> => {
    return ipcRenderer.invoke('orchestrator:runStep', workflowId);
  },

  orchestratorRunAllSteps: (workflowId: string): Promise<WorkflowConfig | null> => {
    return ipcRenderer.invoke('orchestrator:runAllSteps', workflowId);
  },

  orchestratorApproveWorkflow: (workflowId: string): Promise<WorkflowConfig | null> => {
    return ipcRenderer.invoke('orchestrator:approveWorkflow', workflowId);
  },

  orchestratorRejectWorkflow: (workflowId: string, feedback: string): Promise<WorkflowConfig | null> => {
    return ipcRenderer.invoke('orchestrator:rejectWorkflow', workflowId, feedback);
  },

  orchestratorDeleteWorkflow: (workflowId: string): Promise<boolean> => {
    return ipcRenderer.invoke('orchestrator:deleteWorkflow', workflowId);
  },

  orchestratorResetWorkflow: (workflowId: string): Promise<WorkflowConfig | null> => {
    return ipcRenderer.invoke('orchestrator:resetWorkflow', workflowId);
  },

  // Hydra Gateway APIs
  hydraStart: (): Promise<GatewayStatus> => {
    return ipcRenderer.invoke('hydra:start');
  },

  hydraStop: (): Promise<void> => {
    return ipcRenderer.invoke('hydra:stop');
  },

  hydraRefresh: (): Promise<GatewayStatus> => {
    return ipcRenderer.invoke('hydra:refresh');
  },

  hydraGetStatus: (): Promise<GatewayStatus> => {
    return ipcRenderer.invoke('hydra:getStatus');
  },

  hydraGetTools: (): Promise<Array<{ name: string; serverName: string; description?: string }>> => {
    return ipcRenderer.invoke('hydra:getTools');
  },

  hydraSetPort: (port: number): Promise<void> => {
    return ipcRenderer.invoke('hydra:setPort', port);
  },

  onHydraStatusChange: (callback: (status: GatewayStatus) => void) => {
    ipcRenderer.on('hydra:statusChange', (_event, status) => {
      callback(status);
    });
  },

  onHydraServerStateChange: (callback: (data: { serverId: string; serverName: string; status: string; error?: string }) => void) => {
    ipcRenderer.on('hydra:serverStateChange', (_event, data) => {
      callback(data);
    });
  },
});
