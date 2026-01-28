import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// MCP Server Template Types
export interface MCPServerTemplate {
  id: string;
  type: 'jira' | 'github' | 'filesystem' | 'postgres' | 'custom';
  name: string;
  enabled: boolean;

  // For template servers (type-specific settings)
  settings?: {
    // Jira
    url?: string;
    username?: string;
    token?: string;
    readOnly?: boolean;

    // GitHub
    personalAccessToken?: string;

    // Filesystem
    allowedPaths?: string[];

    // PostgreSQL
    connectionString?: string;
  };

  // For custom servers
  custom?: {
    command: string;
    args: string[];
    env: Record<string, string>;
  };
}

export interface MCPConfig {
  servers: MCPServerTemplate[];
}

// Template field definition
export interface MCPTemplateField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'checkbox' | 'textarea';
  placeholder?: string;
}

// Template definition
export interface MCPTemplateDefinition {
  name: string;
  icon: string;
  command: string;
  args: string[];
  settingsToEnv: (settings: MCPServerTemplate['settings']) => Record<string, string>;
  argsFromSettings?: (settings: MCPServerTemplate['settings']) => string[];
  fields: MCPTemplateField[];
}

// MCP Template Definitions
export const MCP_TEMPLATES: Record<string, MCPTemplateDefinition> = {
  jira: {
    name: 'Jira (Atlassian)',
    icon: 'J',
    command: 'uvx',
    args: ['mcp-atlassian'],
    settingsToEnv: (settings) => ({
      ...(settings?.url ? { JIRA_URL: settings.url } : {}),
      ...(settings?.username ? { JIRA_USERNAME: settings.username } : {}),
      ...(settings?.token ? { JIRA_API_TOKEN: settings.token } : {}),
      ...(settings?.readOnly ? { READ_ONLY_MODE: 'true' } : {}),
    }),
    fields: [
      { key: 'url', label: 'Jira URL', type: 'text', placeholder: 'https://company.atlassian.net' },
      { key: 'username', label: 'Username (email)', type: 'text' },
      { key: 'token', label: 'API Token', type: 'password' },
      { key: 'readOnly', label: 'Read-only mode', type: 'checkbox' },
    ],
  },
  github: {
    name: 'GitHub',
    icon: 'G',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    settingsToEnv: (settings) => ({
      ...(settings?.personalAccessToken ? { GITHUB_PERSONAL_ACCESS_TOKEN: settings.personalAccessToken } : {}),
    }),
    fields: [
      { key: 'personalAccessToken', label: 'Personal Access Token', type: 'password' },
    ],
  },
  filesystem: {
    name: 'Filesystem',
    icon: 'F',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    settingsToEnv: () => ({}),
    argsFromSettings: (settings) => settings?.allowedPaths || [],
    fields: [
      { key: 'allowedPaths', label: 'Allowed paths (one per line)', type: 'textarea' },
    ],
  },
  postgres: {
    name: 'PostgreSQL',
    icon: 'P',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    settingsToEnv: () => ({}),
    argsFromSettings: (settings) => settings?.connectionString ? [settings.connectionString] : [],
    fields: [
      { key: 'connectionString', label: 'Connection String', type: 'password', placeholder: 'postgresql://user:pass@localhost/db' },
    ],
  },
};

// Resolved server command format (for actual MCP use)
export interface MCPServerCommand {
  command: string;
  args: string[];
  env: Record<string, string>;
}

class MCPManager {
  private configPath: string;
  private config: MCPConfig;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.configPath = path.join(userDataPath, 'mcp-servers.json');
    this.config = { servers: [] };
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        this.config = JSON.parse(data);
        if (!this.config.servers) {
          this.config.servers = [];
        }
      }
    } catch (error) {
      console.error('Failed to load MCP config:', error);
      this.config = { servers: [] };
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Failed to save MCP config:', error);
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  getServers(): MCPServerTemplate[] {
    return [...this.config.servers];
  }

  getServer(id: string): MCPServerTemplate | null {
    return this.config.servers.find(s => s.id === id) || null;
  }

  addServer(server: Omit<MCPServerTemplate, 'id'>): MCPServerTemplate {
    const newServer: MCPServerTemplate = {
      ...server,
      id: this.generateId(),
    };
    this.config.servers.push(newServer);
    this.save();
    return newServer;
  }

  updateServer(id: string, updates: Partial<Omit<MCPServerTemplate, 'id'>>): MCPServerTemplate | null {
    const index = this.config.servers.findIndex(s => s.id === id);
    if (index === -1) return null;

    const server = this.config.servers[index];
    const updatedServer: MCPServerTemplate = {
      ...server,
      ...updates,
      id: server.id, // Preserve ID
    };
    this.config.servers[index] = updatedServer;
    this.save();
    return updatedServer;
  }

  removeServer(id: string): boolean {
    const index = this.config.servers.findIndex(s => s.id === id);
    if (index === -1) return false;

    this.config.servers.splice(index, 1);
    this.save();
    return true;
  }

  toggleServer(id: string): MCPServerTemplate | null {
    const server = this.config.servers.find(s => s.id === id);
    if (!server) return null;

    server.enabled = !server.enabled;
    this.save();
    return server;
  }

  // Convert a server template to the actual command format
  getServerCommand(server: MCPServerTemplate): MCPServerCommand | null {
    if (server.type === 'custom') {
      if (!server.custom) return null;
      return {
        command: server.custom.command,
        args: server.custom.args,
        env: server.custom.env,
      };
    }

    const template = MCP_TEMPLATES[server.type];
    if (!template) return null;

    const baseArgs = [...template.args];
    const additionalArgs = template.argsFromSettings?.(server.settings) || [];
    const env = template.settingsToEnv(server.settings);

    return {
      command: template.command,
      args: [...baseArgs, ...additionalArgs],
      env,
    };
  }

  // Get all enabled servers with their commands
  getEnabledServerCommands(): Array<{ server: MCPServerTemplate; command: MCPServerCommand }> {
    return this.config.servers
      .filter(s => s.enabled)
      .map(server => {
        const command = this.getServerCommand(server);
        return command ? { server, command } : null;
      })
      .filter((item): item is { server: MCPServerTemplate; command: MCPServerCommand } => item !== null);
  }

  // Get template definitions for UI
  getTemplates(): Record<string, MCPTemplateDefinition> {
    return MCP_TEMPLATES;
  }
}

export const mcpManager = new MCPManager();
