import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// MCP Server Schema Types (for dynamic import)
export interface MCPFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'password' | 'textarea' | 'checkbox' | 'number';
  placeholder?: string;
  required?: boolean;
  default?: string | boolean | number;
  helpText?: string;
  helpUrl?: string;
}

export interface MCPServerSchema {
  name: string;
  description?: string;
  icon?: string;
  command: string;
  args: string[];
  fields: MCPFieldDefinition[];
  envMapping: Record<string, string>;
}

// MCP Server Template Types
export interface MCPServerTemplate {
  id: string;
  type: 'jira' | 'github' | 'filesystem' | 'postgres' | 'custom' | 'imported';
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

    // For imported servers - dynamic settings
    [key: string]: string | boolean | number | string[] | undefined;
  };

  // For custom servers
  custom?: {
    command: string;
    args: string[];
    env: Record<string, string>;
  };

  // For imported servers
  importedSchema?: MCPServerSchema;
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

    // Handle imported servers
    if (server.type === 'imported') {
      if (!server.importedSchema) return null;
      const schema = server.importedSchema;
      const env: Record<string, string> = {};

      // Map settings to environment variables using envMapping
      for (const [fieldKey, envVar] of Object.entries(schema.envMapping)) {
        const value = server.settings?.[fieldKey];
        if (value !== undefined && value !== null && value !== '') {
          env[envVar] = String(value);
        }
      }

      return {
        command: schema.command,
        args: [...schema.args],
        env,
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

  // Validate schema format
  validateSchema(schema: unknown): schema is MCPServerSchema {
    if (!schema || typeof schema !== 'object') return false;
    const s = schema as Record<string, unknown>;

    // Required fields
    if (typeof s.name !== 'string' || !s.name.trim()) return false;
    if (typeof s.command !== 'string' || !s.command.trim()) return false;
    if (!Array.isArray(s.args)) return false;
    if (!Array.isArray(s.fields)) return false;
    if (!s.envMapping || typeof s.envMapping !== 'object') return false;

    // Validate fields
    for (const field of s.fields) {
      if (!field || typeof field !== 'object') return false;
      if (typeof field.key !== 'string' || !field.key.trim()) return false;
      if (typeof field.label !== 'string' || !field.label.trim()) return false;
      if (!['text', 'password', 'textarea', 'checkbox', 'number'].includes(field.type)) return false;
    }

    return true;
  }

  // Import schema from URL
  async importFromUrl(url: string): Promise<MCPServerSchema> {
    try {
      // Validate URL
      const urlObj = new URL(url);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new Error('URL must use http or https protocol');
      }

      // Use net module from electron for fetching (or https/http)
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!this.validateSchema(data)) {
        throw new Error('Invalid schema format. Required fields: name, command, args, fields, envMapping');
      }

      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to import schema from URL: ${error.message}`);
      }
      throw new Error('Failed to import schema from URL: Unknown error');
    }
  }

  // Import schema from file
  importFromFile(filePath: string): MCPServerSchema {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error('File not found');
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);

      if (!this.validateSchema(data)) {
        throw new Error('Invalid schema format. Required fields: name, command, args, fields, envMapping');
      }

      return data;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Invalid schema') || error.message === 'File not found') {
          throw error;
        }
        throw new Error(`Failed to import schema from file: ${error.message}`);
      }
      throw new Error('Failed to import schema from file: Unknown error');
    }
  }

  // Add server from imported schema
  addServerFromSchema(schema: MCPServerSchema, settings: Record<string, unknown>): MCPServerTemplate {
    const serverData: Omit<MCPServerTemplate, 'id'> = {
      type: 'imported',
      name: schema.name,
      enabled: true,
      importedSchema: schema,
      settings: settings as MCPServerTemplate['settings'],
    };

    return this.addServer(serverData);
  }
}

export const mcpManager = new MCPManager();
