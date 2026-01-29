import { contextBridge, ipcRenderer } from 'electron';

export interface Project {
  id: string;
  name: string;
  path: string;
  terminalIds: string[];
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
  loadSession: (): Promise<any> => {
    return ipcRenderer.invoke('session:load');
  },

  saveSession: (data: any) => {
    ipcRenderer.send('session:save', data);
  },

  // Settings APIs
  getSettings: (): Promise<any> => {
    return ipcRenderer.invoke('settings:get');
  },

  updateSettings: (settings: any): Promise<any> => {
    return ipcRenderer.invoke('settings:update', settings);
  },

  setTheme: (theme: 'dark' | 'light'): Promise<any> => {
    return ipcRenderer.invoke('settings:setTheme', theme);
  },

  setFont: (fontFamily: string, fontSize: number): Promise<any> => {
    return ipcRenderer.invoke('settings:setFont', fontFamily, fontSize);
  },

  // Idle notification APIs
  setIdleNotification: (enabled: boolean, timeoutSeconds?: number): Promise<any> => {
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

  addAttachment: (filePath: string, title?: string, linkedProjectId?: string): Promise<any> => {
    return ipcRenderer.invoke('attachment:add', filePath, title, linkedProjectId);
  },

  removeAttachment: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke('attachment:remove', id);
  },

  updateAttachment: (id: string, updates: { title?: string; linkedProjectId?: string }): Promise<any> => {
    return ipcRenderer.invoke('attachment:update', id, updates);
  },

  getAttachments: (): Promise<any[]> => {
    return ipcRenderer.invoke('attachment:list');
  },

  checkFileExists: (filePath: string): Promise<boolean> => {
    return ipcRenderer.invoke('attachment:checkFileExists', filePath);
  },

  readImageAsBase64: (filePath: string): Promise<string | null> => {
    return ipcRenderer.invoke('attachment:readImageAsBase64', filePath);
  },

  // MCP Server APIs
  mcpGetServers: (): Promise<any[]> => {
    return ipcRenderer.invoke('mcp:getServers');
  },

  mcpAddServer: (server: any): Promise<any> => {
    return ipcRenderer.invoke('mcp:addServer', server);
  },

  mcpUpdateServer: (id: string, updates: any): Promise<any> => {
    return ipcRenderer.invoke('mcp:updateServer', id, updates);
  },

  mcpRemoveServer: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke('mcp:removeServer', id);
  },

  mcpToggleServer: (id: string): Promise<any> => {
    return ipcRenderer.invoke('mcp:toggleServer', id);
  },

  mcpGetTemplates: (): Promise<any> => {
    return ipcRenderer.invoke('mcp:getTemplates');
  },

  mcpImportSchemaFromUrl: (url: string): Promise<any> => {
    return ipcRenderer.invoke('mcp:importSchemaFromUrl', url);
  },

  mcpImportSchemaFromFile: (): Promise<any | null> => {
    return ipcRenderer.invoke('mcp:importSchemaFromFile');
  },

  mcpAddServerFromSchema: (schema: any, settings: Record<string, any>): Promise<any> => {
    return ipcRenderer.invoke('mcp:addServerFromSchema', schema, settings);
  },

  // Orchestrator APIs
  orchestratorGetAgents: (): Promise<any[]> => {
    return ipcRenderer.invoke('orchestrator:getAgents');
  },

  orchestratorGetWorkflows: (): Promise<any[]> => {
    return ipcRenderer.invoke('orchestrator:getWorkflows');
  },

  orchestratorGetWorkflow: (id: string): Promise<any | null> => {
    return ipcRenderer.invoke('orchestrator:getWorkflow', id);
  },

  orchestratorCreateWorkflow: (task: string, includeDesignReview: boolean): Promise<any> => {
    return ipcRenderer.invoke('orchestrator:createWorkflow', task, includeDesignReview);
  },

  orchestratorRunStep: (workflowId: string): Promise<any | null> => {
    return ipcRenderer.invoke('orchestrator:runStep', workflowId);
  },

  orchestratorRunAllSteps: (workflowId: string): Promise<any | null> => {
    return ipcRenderer.invoke('orchestrator:runAllSteps', workflowId);
  },

  orchestratorApproveWorkflow: (workflowId: string): Promise<any | null> => {
    return ipcRenderer.invoke('orchestrator:approveWorkflow', workflowId);
  },

  orchestratorRejectWorkflow: (workflowId: string, feedback: string): Promise<any | null> => {
    return ipcRenderer.invoke('orchestrator:rejectWorkflow', workflowId, feedback);
  },

  orchestratorDeleteWorkflow: (workflowId: string): Promise<boolean> => {
    return ipcRenderer.invoke('orchestrator:deleteWorkflow', workflowId);
  },

  orchestratorResetWorkflow: (workflowId: string): Promise<any | null> => {
    return ipcRenderer.invoke('orchestrator:resetWorkflow', workflowId);
  },

  // Hydra Gateway APIs
  hydraStart: (): Promise<any> => {
    return ipcRenderer.invoke('hydra:start');
  },

  hydraStop: (): Promise<void> => {
    return ipcRenderer.invoke('hydra:stop');
  },

  hydraRefresh: (): Promise<any> => {
    return ipcRenderer.invoke('hydra:refresh');
  },

  hydraGetStatus: (): Promise<any> => {
    return ipcRenderer.invoke('hydra:getStatus');
  },

  hydraGetTools: (): Promise<Array<{ name: string; serverName: string; description?: string }>> => {
    return ipcRenderer.invoke('hydra:getTools');
  },

  hydraSetPort: (port: number): Promise<void> => {
    return ipcRenderer.invoke('hydra:setPort', port);
  },

  onHydraStatusChange: (callback: (status: any) => void) => {
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
