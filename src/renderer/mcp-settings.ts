// MCP Server Settings UI

export interface MCPServerTemplate {
  id: string;
  type: 'jira' | 'github' | 'filesystem' | 'postgres' | 'custom';
  name: string;
  enabled: boolean;
  settings?: {
    url?: string;
    username?: string;
    token?: string;
    readOnly?: boolean;
    personalAccessToken?: string;
    allowedPaths?: string[];
    connectionString?: string;
  };
  custom?: {
    command: string;
    args: string[];
    env: Record<string, string>;
  };
}

interface MCPTemplateField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'checkbox' | 'textarea';
  placeholder?: string;
}

interface MCPTemplateDefinition {
  name: string;
  icon: string;
  fields: MCPTemplateField[];
}

// Template definitions for UI (matches main process)
const MCP_TEMPLATES: Record<string, MCPTemplateDefinition> = {
  jira: {
    name: 'Jira (Atlassian)',
    icon: 'J',
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
    fields: [
      { key: 'personalAccessToken', label: 'Personal Access Token', type: 'password' },
    ],
  },
  filesystem: {
    name: 'Filesystem',
    icon: 'F',
    fields: [
      { key: 'allowedPaths', label: 'Allowed paths (one per line)', type: 'textarea' },
    ],
  },
  postgres: {
    name: 'PostgreSQL',
    icon: 'P',
    fields: [
      { key: 'connectionString', label: 'Connection String', type: 'password', placeholder: 'postgresql://user:pass@localhost/db' },
    ],
  },
};

class MCPSettings {
  private element: HTMLElement;
  private isVisible = false;
  private servers: MCPServerTemplate[] = [];
  private currentView: 'list' | 'add' | 'edit' = 'list';
  private editingServerId: string | null = null;
  private selectedType: string | null = null;

  constructor() {
    this.element = this.createPanelElement();
    document.body.appendChild(this.element);
    this.setupEventListeners();
  }

  private createPanelElement(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'mcp-settings-panel';
    panel.innerHTML = `
      <div class="mcp-settings-backdrop"></div>
      <div class="mcp-settings-container">
        <div class="mcp-settings-header">
          <h2 class="mcp-settings-title">MCP Server Settings</h2>
          <button class="mcp-settings-close">&times;</button>
        </div>
        <div class="mcp-settings-content">
          <!-- Content will be rendered dynamically -->
        </div>
      </div>
    `;
    return panel;
  }

  private setupEventListeners(): void {
    this.element.querySelector('.mcp-settings-backdrop')?.addEventListener('click', () => {
      this.hide();
    });

    this.element.querySelector('.mcp-settings-close')?.addEventListener('click', () => {
      this.hide();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        e.preventDefault();
        if (this.currentView !== 'list') {
          this.showListView();
        } else {
          this.hide();
        }
      }
    });
  }

  private async loadServers(): Promise<void> {
    try {
      this.servers = await window.electronAPI.mcpGetServers();
    } catch (error) {
      console.error('Failed to load MCP servers:', error);
      this.servers = [];
    }
  }

  private renderContent(): void {
    const content = this.element.querySelector('.mcp-settings-content') as HTMLElement;
    if (!content) return;

    switch (this.currentView) {
      case 'list':
        this.renderListView(content);
        break;
      case 'add':
        this.renderAddView(content);
        break;
      case 'edit':
        this.renderEditView(content);
        break;
    }
  }

  private renderListView(container: HTMLElement): void {
    const serverListHtml = this.servers.length === 0
      ? '<div class="mcp-empty">No MCP servers configured yet.</div>'
      : this.servers.map(server => `
          <div class="mcp-server-item" data-id="${server.id}">
            <div class="mcp-server-status ${server.enabled ? 'enabled' : 'disabled'}"></div>
            <div class="mcp-server-info">
              <span class="mcp-server-name">${this.escapeHtml(server.name)}</span>
              <span class="mcp-server-type">${this.getTypeLabel(server.type)}</span>
            </div>
            <div class="mcp-server-actions">
              <button class="mcp-btn mcp-btn-toggle" data-id="${server.id}" title="${server.enabled ? 'Disable' : 'Enable'}">
                ${server.enabled ? 'ON' : 'OFF'}
              </button>
              <button class="mcp-btn mcp-btn-edit" data-id="${server.id}">Edit</button>
              <button class="mcp-btn mcp-btn-delete" data-id="${server.id}">Delete</button>
            </div>
          </div>
        `).join('');

    container.innerHTML = `
      <div class="mcp-list-header">
        <span class="mcp-list-title">Configured Servers</span>
        <button class="mcp-btn mcp-btn-add">+ Add Server</button>
      </div>
      <div class="mcp-server-list">
        ${serverListHtml}
      </div>
      <div class="mcp-list-hint">
        Click "Add Server" to configure a new MCP server. Toggle servers on/off to enable/disable them.
      </div>
    `;

    // Bind events
    container.querySelector('.mcp-btn-add')?.addEventListener('click', () => {
      this.showAddView();
    });

    container.querySelectorAll('.mcp-btn-toggle').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = (e.target as HTMLElement).dataset.id;
        if (id) await this.toggleServer(id);
      });
    });

    container.querySelectorAll('.mcp-btn-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.target as HTMLElement).dataset.id;
        if (id) this.showEditView(id);
      });
    });

    container.querySelectorAll('.mcp-btn-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = (e.target as HTMLElement).dataset.id;
        if (id) await this.deleteServer(id);
      });
    });
  }

  private renderAddView(container: HTMLElement): void {
    if (!this.selectedType) {
      // Show type selector
      const typeOptions = [
        ...Object.entries(MCP_TEMPLATES).map(([type, template]) => ({
          type,
          name: template.name,
          icon: template.icon,
        })),
        { type: 'custom', name: 'Custom Server', icon: '+' },
      ];

      container.innerHTML = `
        <div class="mcp-form-header">
          <button class="mcp-btn mcp-btn-back">&larr; Back</button>
          <span class="mcp-form-title">Select Server Type</span>
        </div>
        <div class="mcp-type-grid">
          ${typeOptions.map(opt => `
            <div class="mcp-type-option" data-type="${opt.type}">
              <span class="mcp-type-icon">${opt.icon}</span>
              <span class="mcp-type-name">${opt.name}</span>
            </div>
          `).join('')}
        </div>
      `;

      container.querySelector('.mcp-btn-back')?.addEventListener('click', () => {
        this.showListView();
      });

      container.querySelectorAll('.mcp-type-option').forEach(opt => {
        opt.addEventListener('click', () => {
          this.selectedType = (opt as HTMLElement).dataset.type || null;
          this.renderContent();
        });
      });
    } else {
      // Show form for selected type
      this.renderServerForm(container, null);
    }
  }

  private renderEditView(container: HTMLElement): void {
    const server = this.servers.find(s => s.id === this.editingServerId);
    if (!server) {
      this.showListView();
      return;
    }
    this.renderServerForm(container, server);
  }

  private renderServerForm(container: HTMLElement, server: MCPServerTemplate | null): void {
    const isEdit = server !== null;
    const type = isEdit ? server.type : (this.selectedType as MCPServerTemplate['type']);
    const isCustom = type === 'custom';
    const template = isCustom ? null : MCP_TEMPLATES[type];

    const title = isEdit ? `Edit: ${server.name}` : `Add ${isCustom ? 'Custom' : template?.name} Server`;

    let formFields = '';

    // Server name field (always present)
    const serverName = server?.name || (isCustom ? '' : template?.name || '');
    formFields += `
      <div class="mcp-form-field">
        <label class="mcp-form-label">Server Name</label>
        <input type="text" class="mcp-form-input" id="mcp-field-name" value="${this.escapeHtml(serverName)}" placeholder="Enter server name">
      </div>
    `;

    if (isCustom) {
      // Custom server fields
      const command = server?.custom?.command || '';
      const args = server?.custom?.args?.join('\n') || '';
      const env = server?.custom?.env || {};
      const envEntries = Object.entries(env);

      formFields += `
        <div class="mcp-form-field">
          <label class="mcp-form-label">Command</label>
          <input type="text" class="mcp-form-input" id="mcp-field-command" value="${this.escapeHtml(command)}" placeholder="e.g., npx, uvx, node">
        </div>
        <div class="mcp-form-field">
          <label class="mcp-form-label">Arguments (one per line)</label>
          <textarea class="mcp-form-textarea" id="mcp-field-args" rows="3" placeholder="e.g., -y&#10;@some/mcp-server">${this.escapeHtml(args)}</textarea>
        </div>
        <div class="mcp-form-field">
          <label class="mcp-form-label">Environment Variables</label>
          <div class="mcp-env-list" id="mcp-env-list">
            ${envEntries.map(([key, value], idx) => `
              <div class="mcp-env-row" data-index="${idx}">
                <input type="text" class="mcp-form-input mcp-env-key" value="${this.escapeHtml(key)}" placeholder="KEY">
                <input type="text" class="mcp-form-input mcp-env-value" value="${this.escapeHtml(value)}" placeholder="Value">
                <button class="mcp-btn mcp-btn-small mcp-env-remove" data-index="${idx}">&times;</button>
              </div>
            `).join('')}
          </div>
          <button class="mcp-btn mcp-btn-small mcp-env-add">+ Add Variable</button>
        </div>
      `;
    } else if (template) {
      // Template fields
      for (const field of template.fields) {
        const value = this.getSettingValue(server?.settings, field.key);

        if (field.type === 'checkbox') {
          formFields += `
            <div class="mcp-form-field mcp-form-field-checkbox">
              <label class="mcp-form-checkbox-label">
                <input type="checkbox" class="mcp-form-checkbox" id="mcp-field-${field.key}" ${value ? 'checked' : ''}>
                <span>${field.label}</span>
              </label>
            </div>
          `;
        } else if (field.type === 'textarea') {
          const textValue = Array.isArray(value) ? value.join('\n') : (value || '');
          formFields += `
            <div class="mcp-form-field">
              <label class="mcp-form-label">${field.label}</label>
              <textarea class="mcp-form-textarea" id="mcp-field-${field.key}" rows="4" placeholder="${field.placeholder || ''}">${this.escapeHtml(textValue)}</textarea>
            </div>
          `;
        } else {
          formFields += `
            <div class="mcp-form-field">
              <label class="mcp-form-label">${field.label}</label>
              <input type="${field.type}" class="mcp-form-input" id="mcp-field-${field.key}" value="${this.escapeHtml(value || '')}" placeholder="${field.placeholder || ''}">
            </div>
          `;
        }
      }
    }

    container.innerHTML = `
      <div class="mcp-form-header">
        <button class="mcp-btn mcp-btn-back">&larr; Back</button>
        <span class="mcp-form-title">${title}</span>
      </div>
      <div class="mcp-form-body">
        ${formFields}
      </div>
      <div class="mcp-form-footer">
        <button class="mcp-btn mcp-btn-cancel">Cancel</button>
        <button class="mcp-btn mcp-btn-save">${isEdit ? 'Save Changes' : 'Add Server'}</button>
      </div>
    `;

    // Bind events
    container.querySelector('.mcp-btn-back')?.addEventListener('click', () => {
      if (!isEdit && this.selectedType) {
        this.selectedType = null;
        this.renderContent();
      } else {
        this.showListView();
      }
    });

    container.querySelector('.mcp-btn-cancel')?.addEventListener('click', () => {
      this.showListView();
    });

    container.querySelector('.mcp-btn-save')?.addEventListener('click', async () => {
      await this.saveServer(isEdit, type, server?.id);
    });

    // Custom server environment variable handling
    if (isCustom) {
      container.querySelector('.mcp-env-add')?.addEventListener('click', () => {
        this.addEnvRow(container);
      });

      container.querySelectorAll('.mcp-env-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const row = (e.target as HTMLElement).closest('.mcp-env-row');
          row?.remove();
        });
      });
    }
  }

  private addEnvRow(container: HTMLElement): void {
    const envList = container.querySelector('#mcp-env-list');
    if (!envList) return;

    const row = document.createElement('div');
    row.className = 'mcp-env-row';
    row.innerHTML = `
      <input type="text" class="mcp-form-input mcp-env-key" placeholder="KEY">
      <input type="text" class="mcp-form-input mcp-env-value" placeholder="Value">
      <button class="mcp-btn mcp-btn-small mcp-env-remove">&times;</button>
    `;

    row.querySelector('.mcp-env-remove')?.addEventListener('click', () => {
      row.remove();
    });

    envList.appendChild(row);
  }

  private getSettingValue(settings: MCPServerTemplate['settings'], key: string): string | boolean | string[] | undefined {
    if (!settings) return undefined;
    return (settings as Record<string, unknown>)[key] as string | boolean | string[] | undefined;
  }

  private async saveServer(isEdit: boolean, type: MCPServerTemplate['type'], serverId?: string): Promise<void> {
    const nameInput = this.element.querySelector('#mcp-field-name') as HTMLInputElement;
    const name = nameInput?.value.trim();

    if (!name) {
      alert('Server name is required');
      return;
    }

    let serverData: Omit<MCPServerTemplate, 'id'>;

    if (type === 'custom') {
      const commandInput = this.element.querySelector('#mcp-field-command') as HTMLInputElement;
      const argsInput = this.element.querySelector('#mcp-field-args') as HTMLTextAreaElement;

      const command = commandInput?.value.trim() || '';
      const args = argsInput?.value.split('\n').map(a => a.trim()).filter(a => a) || [];

      // Collect env vars
      const envRows = this.element.querySelectorAll('.mcp-env-row');
      const env: Record<string, string> = {};
      envRows.forEach(row => {
        const keyInput = row.querySelector('.mcp-env-key') as HTMLInputElement;
        const valueInput = row.querySelector('.mcp-env-value') as HTMLInputElement;
        const key = keyInput?.value.trim();
        const value = valueInput?.value || '';
        if (key) {
          env[key] = value;
        }
      });

      if (!command) {
        alert('Command is required for custom servers');
        return;
      }

      serverData = {
        type: 'custom',
        name,
        enabled: isEdit ? (this.servers.find(s => s.id === serverId)?.enabled ?? true) : true,
        custom: { command, args, env },
      };
    } else {
      const template = MCP_TEMPLATES[type];
      const settings: MCPServerTemplate['settings'] = {};

      for (const field of template.fields) {
        const inputEl = this.element.querySelector(`#mcp-field-${field.key}`);

        if (field.type === 'checkbox') {
          (settings as Record<string, unknown>)[field.key] = (inputEl as HTMLInputElement)?.checked;
        } else if (field.type === 'textarea') {
          const textValue = (inputEl as HTMLTextAreaElement)?.value || '';
          // For allowedPaths, convert to array
          if (field.key === 'allowedPaths') {
            settings.allowedPaths = textValue.split('\n').map(p => p.trim()).filter(p => p);
          } else {
            (settings as Record<string, unknown>)[field.key] = textValue;
          }
        } else {
          (settings as Record<string, unknown>)[field.key] = (inputEl as HTMLInputElement)?.value || '';
        }
      }

      serverData = {
        type,
        name,
        enabled: isEdit ? (this.servers.find(s => s.id === serverId)?.enabled ?? true) : true,
        settings,
      };
    }

    try {
      if (isEdit && serverId) {
        await window.electronAPI.mcpUpdateServer(serverId, serverData);
      } else {
        await window.electronAPI.mcpAddServer(serverData);
      }
      await this.loadServers();
      this.showListView();
    } catch (error) {
      console.error('Failed to save server:', error);
      alert('Failed to save server configuration');
    }
  }

  private async toggleServer(id: string): Promise<void> {
    try {
      await window.electronAPI.mcpToggleServer(id);
      await this.loadServers();
      this.renderContent();
    } catch (error) {
      console.error('Failed to toggle server:', error);
    }
  }

  private async deleteServer(id: string): Promise<void> {
    const server = this.servers.find(s => s.id === id);
    if (!server) return;

    const confirmed = confirm(`Delete "${server.name}"?\n\nThis action cannot be undone.`);
    if (!confirmed) return;

    try {
      await window.electronAPI.mcpRemoveServer(id);
      await this.loadServers();
      this.renderContent();
    } catch (error) {
      console.error('Failed to delete server:', error);
    }
  }

  private showListView(): void {
    this.currentView = 'list';
    this.selectedType = null;
    this.editingServerId = null;
    this.renderContent();
  }

  private showAddView(): void {
    this.currentView = 'add';
    this.selectedType = null;
    this.editingServerId = null;
    this.renderContent();
  }

  private showEditView(id: string): void {
    this.currentView = 'edit';
    this.editingServerId = id;
    const server = this.servers.find(s => s.id === id);
    this.selectedType = server?.type || null;
    this.renderContent();
  }

  private getTypeLabel(type: string): string {
    if (type === 'custom') return 'Custom';
    return MCP_TEMPLATES[type]?.name || type;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async show(): Promise<void> {
    this.isVisible = true;
    this.element.classList.add('visible');
    await this.loadServers();
    this.showListView();
  }

  hide(): void {
    this.isVisible = false;
    this.element.classList.remove('visible');
  }

  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  get visible(): boolean {
    return this.isVisible;
  }
}

export const mcpSettings = new MCPSettings();
