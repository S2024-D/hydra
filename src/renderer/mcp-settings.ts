// MCP Server Settings UI

// Schema types for dynamic import
interface MCPFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'password' | 'textarea' | 'checkbox' | 'number';
  placeholder?: string;
  required?: boolean;
  default?: string | boolean | number;
  helpText?: string;
  helpUrl?: string;
}

interface MCPServerSchema {
  name: string;
  description?: string;
  icon?: string;
  command: string;
  args: string[];
  fields: MCPFieldDefinition[];
  envMapping: Record<string, string>;
}

export interface MCPServerTemplate {
  id: string;
  type: 'jira' | 'github' | 'filesystem' | 'postgres' | 'custom' | 'imported';
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
    [key: string]: string | boolean | number | string[] | undefined;
  };
  custom?: {
    command: string;
    args: string[];
    env: Record<string, string>;
  };
  importedSchema?: MCPServerSchema;
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
  private importedSchema: MCPServerSchema | null = null;

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
      ? '<div class="mcp-empty">MCP 서버가 아직 설정되지 않았습니다.</div>'
      : this.servers.map(server => `
          <div class="mcp-server-item" data-id="${server.id}">
            <div class="mcp-server-status ${server.enabled ? 'enabled' : 'disabled'}"></div>
            <div class="mcp-server-info">
              <span class="mcp-server-name">${server.type === 'imported' && server.importedSchema?.icon ? server.importedSchema.icon + ' ' : ''}${this.escapeHtml(server.name)}</span>
              <span class="mcp-server-type">${this.getTypeLabel(server.type, server)}</span>
            </div>
            <div class="mcp-server-actions">
              <button class="mcp-btn mcp-btn-toggle" data-id="${server.id}" title="${server.enabled ? '비활성화' : '활성화'}">
                ${server.enabled ? 'ON' : 'OFF'}
              </button>
              <button class="mcp-btn mcp-btn-edit" data-id="${server.id}">수정</button>
              <button class="mcp-btn mcp-btn-delete" data-id="${server.id}">삭제</button>
            </div>
          </div>
        `).join('');

    container.innerHTML = `
      <div class="mcp-list-header">
        <span class="mcp-list-title">서버 목록</span>
        <button class="mcp-btn mcp-btn-add">+ 서버 추가</button>
      </div>
      <div class="mcp-server-list">
        ${serverListHtml}
      </div>
      <div class="mcp-list-hint">
        "서버 추가"를 클릭하여 새 MCP 서버를 설정하세요. 서버를 ON/OFF 하여 활성화/비활성화할 수 있습니다.
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
    if (!this.selectedType && !this.importedSchema) {
      // Show type selector with import options
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
          <span class="mcp-form-title">MCP 서버 추가</span>
        </div>
        <div class="mcp-add-sections">
          <div class="mcp-add-section">
            <div class="mcp-add-section-title">기본 제공</div>
            <div class="mcp-type-grid">
              ${typeOptions.map(opt => `
                <div class="mcp-type-option" data-type="${opt.type}">
                  <span class="mcp-type-icon">${opt.icon}</span>
                  <span class="mcp-type-name">${opt.name}</span>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="mcp-add-section">
            <div class="mcp-add-section-title">외부에서 가져오기</div>
            <div class="mcp-import-buttons">
              <button class="mcp-btn mcp-btn-import" id="mcp-import-url">
                <span class="mcp-import-icon">🔗</span>
                <span>URL에서 가져오기</span>
              </button>
              <button class="mcp-btn mcp-btn-import" id="mcp-import-file">
                <span class="mcp-import-icon">📁</span>
                <span>파일에서 가져오기</span>
              </button>
            </div>
          </div>
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

      container.querySelector('#mcp-import-url')?.addEventListener('click', () => {
        this.showUrlInputDialog();
      });

      container.querySelector('#mcp-import-file')?.addEventListener('click', () => {
        this.importFromFile();
      });
    } else if (this.importedSchema) {
      // Show form for imported schema
      this.renderImportedSchemaForm(container, null);
    } else {
      // Show form for selected type
      this.renderServerForm(container, null);
    }
  }

  private showUrlInputDialog(): void {
    const dialogHtml = `
      <div class="mcp-url-dialog-overlay">
        <div class="mcp-url-dialog">
          <div class="mcp-url-dialog-header">
            <span class="mcp-url-dialog-title">URL에서 MCP 설정 가져오기</span>
          </div>
          <div class="mcp-url-dialog-body">
            <label class="mcp-form-label">설정 파일 URL</label>
            <input type="text" class="mcp-form-input" id="mcp-url-input" placeholder="https://example.com/mcp-config.json">
            <div class="mcp-url-dialog-error" id="mcp-url-error"></div>
          </div>
          <div class="mcp-url-dialog-footer">
            <button class="mcp-btn mcp-btn-cancel" id="mcp-url-cancel">취소</button>
            <button class="mcp-btn mcp-btn-save" id="mcp-url-submit">가져오기</button>
          </div>
        </div>
      </div>
    `;

    const dialogWrapper = document.createElement('div');
    dialogWrapper.innerHTML = dialogHtml;
    const dialog = dialogWrapper.firstElementChild as HTMLElement;
    this.element.appendChild(dialog);

    const urlInput = dialog.querySelector('#mcp-url-input') as HTMLInputElement;
    const errorDiv = dialog.querySelector('#mcp-url-error') as HTMLElement;
    const cancelBtn = dialog.querySelector('#mcp-url-cancel');
    const submitBtn = dialog.querySelector('#mcp-url-submit');

    urlInput.focus();

    const closeDialog = () => {
      dialog.remove();
    };

    cancelBtn?.addEventListener('click', closeDialog);

    dialog.querySelector('.mcp-url-dialog-overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        closeDialog();
      }
    });

    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        submitBtn?.dispatchEvent(new Event('click'));
      } else if (e.key === 'Escape') {
        closeDialog();
      }
    });

    submitBtn?.addEventListener('click', async () => {
      const url = urlInput.value.trim();
      if (!url) {
        errorDiv.textContent = 'URL을 입력해주세요.';
        return;
      }

      try {
        errorDiv.textContent = '불러오는 중...';
        submitBtn.setAttribute('disabled', 'true');

        const schema = await window.electronAPI.mcpImportSchemaFromUrl(url);
        closeDialog();
        this.importedSchema = schema;
        this.renderContent();
      } catch (error) {
        errorDiv.textContent = error instanceof Error ? error.message : '스키마를 불러오는데 실패했습니다.';
        submitBtn.removeAttribute('disabled');
      }
    });
  }

  private async importFromFile(): Promise<void> {
    try {
      const schema = await window.electronAPI.mcpImportSchemaFromFile();
      if (schema) {
        this.importedSchema = schema;
        this.renderContent();
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : '파일을 불러오는데 실패했습니다.');
    }
  }

  private renderImportedSchemaForm(container: HTMLElement, server: MCPServerTemplate | null): void {
    const schema = server?.importedSchema || this.importedSchema;
    if (!schema) {
      this.showAddView();
      return;
    }

    const isEdit = server !== null;
    const title = isEdit ? `수정: ${server.name}` : schema.name;
    const description = schema.description || '';
    const icon = schema.icon || '📦';

    let formFields = '';

    // Server name field
    const serverName = server?.name || schema.name;
    formFields += `
      <div class="mcp-form-field">
        <label class="mcp-form-label">서버 이름</label>
        <input type="text" class="mcp-form-input" id="mcp-field-name" value="${this.escapeHtml(serverName)}" placeholder="서버 이름 입력">
      </div>
    `;

    // Dynamic fields from schema
    for (const field of schema.fields) {
      const value = this.getSettingValue(server?.settings, field.key);
      const defaultValue = field.default;
      const displayValue = value !== undefined ? value : defaultValue;
      const requiredMark = field.required ? ' *' : '';

      // Help link
      const helpLink = field.helpUrl ? `<a href="#" class="mcp-help-link" data-url="${this.escapeHtml(field.helpUrl)}">${field.helpText ? '도움말' : '자세히 보기'}</a>` : '';

      if (field.type === 'checkbox') {
        const checked = displayValue === true || displayValue === 'true';
        formFields += `
          <div class="mcp-form-field mcp-form-field-checkbox">
            <label class="mcp-form-checkbox-label">
              <input type="checkbox" class="mcp-form-checkbox" id="mcp-field-${field.key}" ${checked ? 'checked' : ''}>
              <span>${field.label}${requiredMark}</span>
            </label>
            ${field.helpText ? `<div class="mcp-help-text">${this.escapeHtml(field.helpText)} ${helpLink}</div>` : (helpLink ? `<div class="mcp-help-text">${helpLink}</div>` : '')}
          </div>
        `;
      } else if (field.type === 'textarea') {
        const textValue = Array.isArray(displayValue) ? displayValue.join('\n') : (displayValue || '');
        formFields += `
          <div class="mcp-form-field">
            <label class="mcp-form-label">${field.label}${requiredMark} ${helpLink}</label>
            <textarea class="mcp-form-textarea" id="mcp-field-${field.key}" rows="4" placeholder="${field.placeholder || ''}">${this.escapeHtml(String(textValue))}</textarea>
            ${field.helpText ? `<div class="mcp-help-text">${this.escapeHtml(field.helpText)}</div>` : ''}
          </div>
        `;
      } else if (field.type === 'number') {
        formFields += `
          <div class="mcp-form-field">
            <label class="mcp-form-label">${field.label}${requiredMark} ${helpLink}</label>
            <input type="number" class="mcp-form-input" id="mcp-field-${field.key}" value="${this.escapeHtml(String(displayValue || ''))}" placeholder="${field.placeholder || ''}">
            ${field.helpText ? `<div class="mcp-help-text">${this.escapeHtml(field.helpText)}</div>` : ''}
          </div>
        `;
      } else {
        formFields += `
          <div class="mcp-form-field">
            <label class="mcp-form-label">${field.label}${requiredMark} ${helpLink}</label>
            <input type="${field.type}" class="mcp-form-input" id="mcp-field-${field.key}" value="${this.escapeHtml(String(displayValue || ''))}" placeholder="${field.placeholder || ''}">
            ${field.helpText ? `<div class="mcp-help-text">${this.escapeHtml(field.helpText)}</div>` : ''}
          </div>
        `;
      }
    }

    container.innerHTML = `
      <div class="mcp-form-header">
        <button class="mcp-btn mcp-btn-back">&larr; Back</button>
        <span class="mcp-form-title">${icon} ${title}</span>
      </div>
      ${description ? `<div class="mcp-schema-description">${this.escapeHtml(description)}</div>` : ''}
      <div class="mcp-form-body">
        ${formFields}
      </div>
      <div class="mcp-form-footer">
        <button class="mcp-btn mcp-btn-cancel">취소</button>
        <button class="mcp-btn mcp-btn-save">${isEdit ? '저장' : '추가'}</button>
      </div>
    `;

    // Bind events
    container.querySelector('.mcp-btn-back')?.addEventListener('click', () => {
      if (!isEdit) {
        this.importedSchema = null;
      }
      this.showAddView();
    });

    container.querySelector('.mcp-btn-cancel')?.addEventListener('click', () => {
      this.importedSchema = null;
      this.showListView();
    });

    container.querySelector('.mcp-btn-save')?.addEventListener('click', async () => {
      await this.saveImportedServer(isEdit, schema, server?.id);
    });

    // Handle help links
    container.querySelectorAll('.mcp-help-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const url = (link as HTMLElement).dataset.url;
        if (url) {
          // Open in external browser (would need to add shell.openExternal in real implementation)
          window.open(url, '_blank');
        }
      });
    });
  }

  private async saveImportedServer(isEdit: boolean, schema: MCPServerSchema, serverId?: string): Promise<void> {
    const nameInput = this.element.querySelector('#mcp-field-name') as HTMLInputElement;
    const name = nameInput?.value.trim();

    if (!name) {
      alert('서버 이름을 입력해주세요.');
      return;
    }

    // Collect settings from schema fields
    const settings: Record<string, unknown> = {};
    for (const field of schema.fields) {
      const inputEl = this.element.querySelector(`#mcp-field-${field.key}`);

      if (field.type === 'checkbox') {
        settings[field.key] = (inputEl as HTMLInputElement)?.checked;
      } else if (field.type === 'number') {
        const numValue = (inputEl as HTMLInputElement)?.value;
        settings[field.key] = numValue ? Number(numValue) : undefined;
      } else if (field.type === 'textarea') {
        settings[field.key] = (inputEl as HTMLTextAreaElement)?.value || '';
      } else {
        settings[field.key] = (inputEl as HTMLInputElement)?.value || '';
      }

      // Validate required fields
      if (field.required) {
        const value = settings[field.key];
        if (value === undefined || value === null || value === '') {
          alert(`${field.label}은(는) 필수 항목입니다.`);
          return;
        }
      }
    }

    try {
      if (isEdit && serverId) {
        // Update existing server
        await window.electronAPI.mcpUpdateServer(serverId, {
          name,
          settings: settings as MCPServerTemplate['settings'],
          importedSchema: schema,
        });
      } else {
        // Add new server from schema
        await window.electronAPI.mcpAddServerFromSchema(schema, settings);
      }
      this.importedSchema = null;
      await this.loadServers();
      this.showListView();
    } catch (error) {
      console.error('Failed to save server:', error);
      alert('서버 설정을 저장하는데 실패했습니다.');
    }
  }

  private renderEditView(container: HTMLElement): void {
    const server = this.servers.find(s => s.id === this.editingServerId);
    if (!server) {
      this.showListView();
      return;
    }

    // Handle imported servers with their stored schema
    if (server.type === 'imported' && server.importedSchema) {
      this.renderImportedSchemaForm(container, server);
    } else {
      this.renderServerForm(container, server);
    }
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
    this.importedSchema = null;
    this.renderContent();
  }

  private showAddView(): void {
    this.currentView = 'add';
    this.selectedType = null;
    this.editingServerId = null;
    // Don't reset importedSchema here as we might be coming back from the form
    this.renderContent();
  }

  private showEditView(id: string): void {
    this.currentView = 'edit';
    this.editingServerId = id;
    const server = this.servers.find(s => s.id === id);
    this.selectedType = server?.type || null;
    this.renderContent();
  }

  private getTypeLabel(type: string, server?: MCPServerTemplate): string {
    if (type === 'custom') return 'Custom';
    if (type === 'imported') {
      return server?.importedSchema?.name || 'Imported';
    }
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
