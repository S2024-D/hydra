// Settings Panel with MCP and Claude Hooks tabs

export interface Settings {
  theme: 'dark' | 'light';
  fontFamily: string;
  fontSize: number;
  idleNotification: {
    enabled: boolean;
    timeoutSeconds: number;
  };
}

export type SettingsUpdateCallback = (settings: Settings) => void;

// Claude Hooks interfaces
interface FlattenedHook {
  id: string;
  eventName: string;
  entryIndex: number;
  hookIndex: number;
  matcher?: string;
  type: 'command' | 'prompt';
  command?: string;
  prompt?: string;
  timeout?: number;
}

const HOOK_EVENTS = [
  { value: 'PreToolUse', label: 'PreToolUse', description: 'Before tool execution. Can block (exit 2) or modify.', needsMatcher: true },
  { value: 'PostToolUse', label: 'PostToolUse', description: 'After tool completes successfully.', needsMatcher: true },
  { value: 'Notification', label: 'Notification', description: 'On notifications (permission_prompt, idle_prompt).', needsMatcher: true },
  { value: 'Stop', label: 'Stop', description: 'When Claude response completes.', needsMatcher: false },
  { value: 'SessionStart', label: 'SessionStart', description: 'On session start/resume.', needsMatcher: false },
  { value: 'SessionEnd', label: 'SessionEnd', description: 'On session end.', needsMatcher: false },
  { value: 'UserPromptSubmit', label: 'UserPromptSubmit', description: 'When user submits prompt.', needsMatcher: false },
];

// MCP interfaces (from mcp-settings.ts)
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

type TabId = 'general' | 'appearance' | 'mcp' | 'hooks' | 'shortcuts';

export class SettingsPanel {
  private element: HTMLElement;
  private isVisible = false;
  private settings: Settings | null = null;
  private onUpdate: SettingsUpdateCallback | null = null;
  private activeTab: TabId = 'general';

  // Claude Hooks state
  private claudeHooks: FlattenedHook[] = [];
  private editingHook: FlattenedHook | null = null;

  // MCP state
  private mcpServers: MCPServerTemplate[] = [];
  private mcpDialogVisible = false;
  private mcpDialogMode: 'type-select' | 'form' = 'type-select';
  private editingMcpServer: MCPServerTemplate | null = null;
  private selectedMcpType: string | null = null;
  private importedMcpSchema: MCPServerSchema | null = null;

  constructor() {
    this.element = this.createPanelElement();
    document.body.appendChild(this.element);
    this.setupEventListeners();
  }

  private createPanelElement(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'settings-panel';
    panel.innerHTML = `
      <div class="settings-panel-backdrop"></div>
      <div class="settings-panel-container settings-panel-tabbed">
        <div class="settings-panel-header">
          <h2 class="settings-panel-title">Settings</h2>
          <button class="settings-panel-close">&times;</button>
        </div>

        <!-- Tab Navigation -->
        <div class="settings-tabs">
          <button class="settings-tab active" data-tab="general">General</button>
          <button class="settings-tab" data-tab="appearance">Appearance</button>
          <button class="settings-tab" data-tab="mcp">MCP Servers</button>
          <button class="settings-tab" data-tab="hooks">Claude Hooks</button>
          <button class="settings-tab" data-tab="shortcuts">Shortcuts</button>
        </div>

        <div class="settings-panel-content">
          <!-- General Tab -->
          <div class="settings-tab-content active" data-tab="general">
            <div class="settings-section">
              <h3 class="settings-section-title">Notifications</h3>
              <div class="settings-item">
                <label class="settings-label">
                  Idle Terminal Notifications
                  <span class="settings-hint">Get notified when an inactive terminal has output</span>
                </label>
                <div class="settings-control">
                  <label class="settings-toggle">
                    <input type="checkbox" id="setting-idle-notification">
                    <span class="settings-toggle-slider"></span>
                  </label>
                </div>
              </div>
              <div class="settings-item" id="idle-timeout-setting">
                <label class="settings-label">Idle Timeout</label>
                <div class="settings-control settings-control-row">
                  <input type="range" id="setting-idle-timeout" class="settings-range" min="1" max="30" step="1">
                  <span id="setting-idle-timeout-value" class="settings-value">3s</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Appearance Tab -->
          <div class="settings-tab-content" data-tab="appearance">
            <div class="settings-section">
              <h3 class="settings-section-title">Theme</h3>
              <div class="settings-item">
                <label class="settings-label">App Theme</label>
                <div class="settings-control">
                  <select id="setting-theme" class="settings-select">
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </div>
              </div>
            </div>
            <div class="settings-section">
              <h3 class="settings-section-title">Font</h3>
              <div class="settings-item">
                <label class="settings-label">Font Family</label>
                <div class="settings-control">
                  <select id="setting-font-family" class="settings-select">
                    <option value="Menlo, Monaco, 'Courier New', monospace">Menlo</option>
                    <option value="Monaco, Menlo, 'Courier New', monospace">Monaco</option>
                    <option value="'Courier New', Courier, monospace">Courier New</option>
                    <option value="'SF Mono', Menlo, Monaco, monospace">SF Mono</option>
                    <option value="'Fira Code', Menlo, Monaco, monospace">Fira Code</option>
                    <option value="Consolas, 'Courier New', monospace">Consolas</option>
                  </select>
                </div>
              </div>
              <div class="settings-item">
                <label class="settings-label">Font Size</label>
                <div class="settings-control settings-control-row">
                  <input type="range" id="setting-font-size" class="settings-range" min="8" max="24" step="1">
                  <span id="setting-font-size-value" class="settings-value">14px</span>
                </div>
              </div>
            </div>
          </div>

          <!-- MCP Servers Tab -->
          <div class="settings-tab-content" data-tab="mcp">
            <div class="settings-section">
              <div class="settings-section-header">
                <h3 class="settings-section-title">MCP Servers</h3>
                <button id="add-mcp-server-btn" class="settings-button-small">+ Add Server</button>
              </div>
              <p class="settings-hint" style="margin-bottom: 12px;">
                Configure MCP servers for AI assistant integration
              </p>
              <div id="mcp-servers-list" class="mcp-servers-list">
                <!-- Servers will be rendered here -->
              </div>
            </div>
          </div>

          <!-- Claude Hooks Tab -->
          <div class="settings-tab-content" data-tab="hooks">
            <div class="settings-section">
              <div class="settings-section-header">
                <h3 class="settings-section-title">Claude Code Hooks</h3>
                <button id="add-hook-btn" class="settings-button-small">+ Add Hook</button>
              </div>
              <p class="settings-hint" style="margin-bottom: 12px;">
                Configure hooks for Claude Code CLI. Saved to ~/.claude/settings.json
              </p>
              <div id="claude-hooks-list" class="claude-hooks-list">
                <!-- Hooks will be rendered here -->
              </div>
            </div>
          </div>

          <!-- Shortcuts Tab -->
          <div class="settings-tab-content" data-tab="shortcuts">
            <div class="settings-section">
              <h3 class="settings-section-title">Terminal</h3>
              <div class="shortcuts-list">
                <div class="shortcut-item">
                  <span class="shortcut-label">New Terminal</span>
                  <span class="shortcut-key">⌘T</span>
                </div>
                <div class="shortcut-item">
                  <span class="shortcut-label">Close Terminal</span>
                  <span class="shortcut-key">⌘W</span>
                </div>
                <div class="shortcut-item">
                  <span class="shortcut-label">Split Right</span>
                  <span class="shortcut-key">⌘\\</span>
                </div>
                <div class="shortcut-item">
                  <span class="shortcut-label">Split Down</span>
                  <span class="shortcut-key">⌘⇧\\</span>
                </div>
              </div>
            </div>
            <div class="settings-section">
              <h3 class="settings-section-title">Navigation</h3>
              <div class="shortcuts-list">
                <div class="shortcut-item">
                  <span class="shortcut-label">Command Palette</span>
                  <span class="shortcut-key">⌘⇧P</span>
                </div>
                <div class="shortcut-item">
                  <span class="shortcut-label">Settings</span>
                  <span class="shortcut-key">⌘,</span>
                </div>
                <div class="shortcut-item">
                  <span class="shortcut-label">Next Project</span>
                  <span class="shortcut-key">⌘⌥]</span>
                </div>
                <div class="shortcut-item">
                  <span class="shortcut-label">Previous Project</span>
                  <span class="shortcut-key">⌘⌥[</span>
                </div>
                <div class="shortcut-item">
                  <span class="shortcut-label">Switch Terminal (MRU)</span>
                  <span class="shortcut-key">⌃Tab</span>
                </div>
              </div>
            </div>
            <div class="settings-section">
              <h3 class="settings-section-title">View</h3>
              <div class="shortcuts-list">
                <div class="shortcut-item">
                  <span class="shortcut-label">Focus Panel 1/2/3</span>
                  <span class="shortcut-key">⌘1/2/3</span>
                </div>
                <div class="shortcut-item">
                  <span class="shortcut-label">Toggle Single/Multi View</span>
                  <span class="shortcut-key">⌘⇧M</span>
                </div>
                <div class="shortcut-item">
                  <span class="shortcut-label">Image Attachments</span>
                  <span class="shortcut-key">⌘I</span>
                </div>
                <div class="shortcut-item">
                  <span class="shortcut-label">Find in Terminal</span>
                  <span class="shortcut-key">⌘F</span>
                </div>
                <div class="shortcut-item">
                  <span class="shortcut-label">MCP Servers (Settings)</span>
                  <span class="shortcut-key">⌘⇧,</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Hook Edit Dialog -->
      <div id="hook-dialog" class="hook-dialog">
        <div class="hook-dialog-backdrop"></div>
        <div class="hook-dialog-container">
          <div class="hook-dialog-header">
            <h3 id="hook-dialog-title">Add Hook</h3>
            <button class="hook-dialog-close">&times;</button>
          </div>
          <div class="hook-dialog-content">
            <div class="hook-dialog-field">
              <label>Event Type</label>
              <select id="hook-event" class="settings-select">
                ${HOOK_EVENTS.map(e => `<option value="${e.value}">${e.label}</option>`).join('')}
              </select>
              <span id="hook-event-desc" class="settings-hint"></span>
            </div>
            <div class="hook-dialog-field" id="hook-matcher-field">
              <label>Matcher (Tool Pattern)</label>
              <input type="text" id="hook-matcher" class="settings-input" placeholder="e.g., Edit|Write, Bash, *">
              <span class="settings-hint">Regex supported. Examples: Bash, Edit|Write, Notebook.*</span>
            </div>
            <div class="hook-dialog-field">
              <label>Type</label>
              <select id="hook-type" class="settings-select">
                <option value="command">Command</option>
                <option value="prompt">Prompt (LLM-based)</option>
              </select>
            </div>
            <div class="hook-dialog-field" id="hook-command-field">
              <label>Command</label>
              <textarea id="hook-command" class="settings-textarea" rows="3" placeholder="e.g., echo 'Hook triggered' >> ~/hook.log"></textarea>
              <span class="settings-hint">Shell command to execute. Receives JSON via stdin.</span>
            </div>
            <div class="hook-dialog-field" id="hook-prompt-field" style="display: none;">
              <label>Prompt</label>
              <textarea id="hook-prompt" class="settings-textarea" rows="3" placeholder="Prompt for LLM-based hook..."></textarea>
              <span class="settings-hint">Prompt to send to the LLM for evaluation.</span>
            </div>
            <div class="hook-dialog-field">
              <label>Timeout (seconds)</label>
              <input type="number" id="hook-timeout" class="settings-input" value="60" min="1" max="300">
              <span class="settings-hint">Default: 60 seconds</span>
            </div>
          </div>
          <div class="hook-dialog-footer">
            <button id="hook-cancel-btn" class="settings-button-secondary">Cancel</button>
            <button id="hook-save-btn" class="settings-button-primary">Save Hook</button>
          </div>
        </div>
      </div>

      <!-- MCP Server Dialog -->
      <div id="mcp-dialog" class="mcp-dialog">
        <div class="mcp-dialog-backdrop"></div>
        <div class="mcp-dialog-container">
          <div class="mcp-dialog-header">
            <button class="mcp-dialog-back" style="display: none;">&larr;</button>
            <h3 id="mcp-dialog-title">Add MCP Server</h3>
            <button class="mcp-dialog-close">&times;</button>
          </div>
          <div id="mcp-dialog-content" class="mcp-dialog-content">
            <!-- Content will be rendered dynamically -->
          </div>
        </div>
      </div>
    `;
    return panel;
  }

  private switchTab(tabId: TabId): void {
    this.activeTab = tabId;

    // Update tab buttons
    this.element.querySelectorAll('.settings-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === tabId);
    });

    // Update tab contents
    this.element.querySelectorAll('.settings-tab-content').forEach(content => {
      content.classList.toggle('active', content.getAttribute('data-tab') === tabId);
    });

    // Load data when switching to specific tabs
    if (tabId === 'hooks') {
      this.loadClaudeHooks();
    } else if (tabId === 'mcp') {
      this.loadMcpServers();
    }
  }

  private setupEventListeners(): void {
    // Tab switching
    this.element.querySelectorAll('.settings-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.getAttribute('data-tab') as TabId;
        if (tabId) this.switchTab(tabId);
      });
    });

    // Close button
    this.element.querySelector('.settings-panel-close')?.addEventListener('click', () => {
      this.hide();
    });

    // Backdrop click
    this.element.querySelector('.settings-panel-backdrop')?.addEventListener('click', () => {
      this.hide();
    });

    // Theme select
    const themeSelect = this.element.querySelector('#setting-theme') as HTMLSelectElement;
    themeSelect?.addEventListener('change', () => {
      if (this.settings) {
        this.settings.theme = themeSelect.value as 'dark' | 'light';
        this.notifyUpdate();
      }
    });

    // Font family select
    const fontFamilySelect = this.element.querySelector('#setting-font-family') as HTMLSelectElement;
    fontFamilySelect?.addEventListener('change', () => {
      if (this.settings) {
        this.settings.fontFamily = fontFamilySelect.value;
        this.notifyUpdate();
      }
    });

    // Font size slider
    const fontSizeSlider = this.element.querySelector('#setting-font-size') as HTMLInputElement;
    const fontSizeValue = this.element.querySelector('#setting-font-size-value') as HTMLSpanElement;
    fontSizeSlider?.addEventListener('input', () => {
      const size = parseInt(fontSizeSlider.value);
      fontSizeValue.textContent = `${size}px`;
      if (this.settings) {
        this.settings.fontSize = size;
        this.notifyUpdate();
      }
    });

    // Idle notification toggle
    const idleToggle = this.element.querySelector('#setting-idle-notification') as HTMLInputElement;
    const idleTimeoutSetting = this.element.querySelector('#idle-timeout-setting') as HTMLElement;
    idleToggle?.addEventListener('change', () => {
      if (this.settings) {
        this.settings.idleNotification.enabled = idleToggle.checked;
        idleTimeoutSetting.style.opacity = idleToggle.checked ? '1' : '0.5';
        this.notifyUpdate();
      }
    });

    // Idle timeout slider
    const idleTimeoutSlider = this.element.querySelector('#setting-idle-timeout') as HTMLInputElement;
    const idleTimeoutValue = this.element.querySelector('#setting-idle-timeout-value') as HTMLSpanElement;
    idleTimeoutSlider?.addEventListener('input', () => {
      const timeout = parseInt(idleTimeoutSlider.value);
      idleTimeoutValue.textContent = `${timeout}s`;
      if (this.settings) {
        this.settings.idleNotification.timeoutSeconds = timeout;
        this.notifyUpdate();
      }
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        // Check if MCP dialog is open
        if (this.mcpDialogVisible) {
          if (this.mcpDialogMode === 'form') {
            // Go back to type select
            this.mcpDialogMode = 'type-select';
            this.selectedMcpType = null;
            this.renderMcpDialogContent();
          } else {
            this.hideMcpDialog();
          }
          return;
        }

        const hookDialog = this.element.querySelector('#hook-dialog') as HTMLElement;
        if (hookDialog?.classList.contains('visible')) {
          this.hideHookDialog();
        } else {
          e.preventDefault();
          this.hide();
        }
      }
    });

    // Claude Hooks: Add button
    this.element.querySelector('#add-hook-btn')?.addEventListener('click', () => {
      this.showHookDialog();
    });

    // Hook dialog events
    this.element.querySelector('.hook-dialog-close')?.addEventListener('click', () => {
      this.hideHookDialog();
    });
    this.element.querySelector('.hook-dialog-backdrop')?.addEventListener('click', () => {
      this.hideHookDialog();
    });

    const hookEventSelect = this.element.querySelector('#hook-event') as HTMLSelectElement;
    hookEventSelect?.addEventListener('change', () => {
      this.updateHookDialogForEvent(hookEventSelect.value);
    });

    const hookTypeSelect = this.element.querySelector('#hook-type') as HTMLSelectElement;
    hookTypeSelect?.addEventListener('change', () => {
      const commandField = this.element.querySelector('#hook-command-field') as HTMLElement;
      const promptField = this.element.querySelector('#hook-prompt-field') as HTMLElement;
      if (hookTypeSelect.value === 'command') {
        commandField.style.display = 'block';
        promptField.style.display = 'none';
      } else {
        commandField.style.display = 'none';
        promptField.style.display = 'block';
      }
    });

    this.element.querySelector('#hook-cancel-btn')?.addEventListener('click', () => {
      this.hideHookDialog();
    });
    this.element.querySelector('#hook-save-btn')?.addEventListener('click', () => {
      this.saveHook();
    });

    // MCP: Add server button
    this.element.querySelector('#add-mcp-server-btn')?.addEventListener('click', () => {
      this.showMcpDialog();
    });

    // MCP dialog events
    this.element.querySelector('.mcp-dialog-close')?.addEventListener('click', () => {
      this.hideMcpDialog();
    });
    this.element.querySelector('.mcp-dialog-backdrop')?.addEventListener('click', () => {
      this.hideMcpDialog();
    });
    this.element.querySelector('.mcp-dialog-back')?.addEventListener('click', () => {
      if (this.mcpDialogMode === 'form') {
        this.mcpDialogMode = 'type-select';
        this.selectedMcpType = null;
        this.importedMcpSchema = null;
        this.renderMcpDialogContent();
      }
    });
  }

  // ==================== MCP Methods ====================

  private async loadMcpServers(): Promise<void> {
    try {
      this.mcpServers = await window.electronAPI.mcpGetServers();
      this.renderMcpServers();
    } catch (error) {
      console.error('Failed to load MCP servers:', error);
      this.mcpServers = [];
    }
  }

  private renderMcpServers(): void {
    const container = this.element.querySelector('#mcp-servers-list') as HTMLElement;
    if (!container) return;

    if (this.mcpServers.length === 0) {
      container.innerHTML = `
        <div class="mcp-servers-empty">
          No MCP servers configured. Click "+ Add Server" to create one.
        </div>
      `;
      return;
    }

    container.innerHTML = this.mcpServers.map(server => `
      <div class="mcp-server-item" data-id="${server.id}">
        <div class="mcp-server-status ${server.enabled ? 'enabled' : 'disabled'}"></div>
        <div class="mcp-server-info">
          <span class="mcp-server-name">${server.type === 'imported' && server.importedSchema?.icon ? server.importedSchema.icon + ' ' : ''}${this.escapeHtml(server.name)}</span>
          <span class="mcp-server-type">${this.getMcpTypeLabel(server)}</span>
        </div>
        <div class="mcp-server-actions">
          <button class="mcp-btn mcp-btn-toggle mcp-btn-small ${server.enabled ? 'on' : 'off'}" data-id="${server.id}">
            ${server.enabled ? 'ON' : 'OFF'}
          </button>
          <button class="mcp-btn mcp-btn-small" data-id="${server.id}" data-action="edit">Edit</button>
          <button class="mcp-btn mcp-btn-small mcp-btn-delete" data-id="${server.id}" data-action="delete">Delete</button>
        </div>
      </div>
    `).join('');

    // Bind events
    container.querySelectorAll('.mcp-btn-toggle').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = (e.target as HTMLElement).dataset.id;
        if (id) await this.toggleMcpServer(id);
      });
    });

    container.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.target as HTMLElement).dataset.id;
        if (id) this.showMcpDialog(id);
      });
    });

    container.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = (e.target as HTMLElement).dataset.id;
        if (id) await this.deleteMcpServer(id);
      });
    });
  }

  private getMcpTypeLabel(server: MCPServerTemplate): string {
    if (server.type === 'custom') return 'Custom';
    if (server.type === 'imported') return server.importedSchema?.name || 'Imported';
    return MCP_TEMPLATES[server.type]?.name || server.type;
  }

  private async toggleMcpServer(id: string): Promise<void> {
    try {
      await window.electronAPI.mcpToggleServer(id);
      await this.loadMcpServers();
    } catch (error) {
      console.error('Failed to toggle server:', error);
    }
  }

  private async deleteMcpServer(id: string): Promise<void> {
    const server = this.mcpServers.find(s => s.id === id);
    if (!server) return;

    if (!confirm(`Delete "${server.name}"?\n\nThis action cannot be undone.`)) return;

    try {
      await window.electronAPI.mcpRemoveServer(id);
      await this.loadMcpServers();
    } catch (error) {
      console.error('Failed to delete server:', error);
    }
  }

  private showMcpDialog(editId?: string): void {
    this.mcpDialogVisible = true;
    this.editingMcpServer = editId ? this.mcpServers.find(s => s.id === editId) || null : null;

    const dialog = this.element.querySelector('#mcp-dialog') as HTMLElement;
    const title = this.element.querySelector('#mcp-dialog-title') as HTMLElement;

    if (this.editingMcpServer) {
      title.textContent = `Edit: ${this.editingMcpServer.name}`;
      this.selectedMcpType = this.editingMcpServer.type;
      this.mcpDialogMode = 'form';

      if (this.editingMcpServer.type === 'imported' && this.editingMcpServer.importedSchema) {
        this.importedMcpSchema = this.editingMcpServer.importedSchema;
      }
    } else {
      title.textContent = 'Add MCP Server';
      this.selectedMcpType = null;
      this.importedMcpSchema = null;
      this.mcpDialogMode = 'type-select';
    }

    this.renderMcpDialogContent();
    dialog.classList.add('visible');
  }

  private hideMcpDialog(): void {
    this.mcpDialogVisible = false;
    this.editingMcpServer = null;
    this.selectedMcpType = null;
    this.importedMcpSchema = null;
    this.mcpDialogMode = 'type-select';

    const dialog = this.element.querySelector('#mcp-dialog') as HTMLElement;
    dialog.classList.remove('visible');
  }

  private renderMcpDialogContent(): void {
    const content = this.element.querySelector('#mcp-dialog-content') as HTMLElement;
    const backBtn = this.element.querySelector('.mcp-dialog-back') as HTMLElement;
    const title = this.element.querySelector('#mcp-dialog-title') as HTMLElement;

    if (this.mcpDialogMode === 'type-select') {
      backBtn.style.display = 'none';
      title.textContent = 'Add MCP Server';
      this.renderMcpTypeSelect(content);
    } else {
      backBtn.style.display = this.editingMcpServer ? 'none' : 'inline-block';

      if (this.importedMcpSchema) {
        title.textContent = this.editingMcpServer
          ? `Edit: ${this.editingMcpServer.name}`
          : this.importedMcpSchema.name;
        this.renderMcpImportedForm(content);
      } else {
        const template = this.selectedMcpType ? MCP_TEMPLATES[this.selectedMcpType] : null;
        const templateName = template && typeof template === 'object' && 'name' in template ? template.name : this.selectedMcpType;
        title.textContent = this.editingMcpServer
          ? `Edit: ${this.editingMcpServer.name}`
          : `Add ${this.selectedMcpType === 'custom' ? 'Custom' : templateName} Server`;
        this.renderMcpServerForm(content);
      }
    }
  }

  private renderMcpTypeSelect(container: HTMLElement): void {
    const typeOptions = [
      ...Object.entries(MCP_TEMPLATES).map(([type, template]) => ({
        type,
        name: template.name,
        icon: template.icon,
      })),
      { type: 'custom', name: 'Custom Server', icon: '+' },
    ];

    container.innerHTML = `
      <div class="mcp-add-sections">
        <div class="mcp-add-section">
          <div class="mcp-add-section-title">Built-in Templates</div>
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
          <div class="mcp-add-section-title">Import from External</div>
          <div class="mcp-import-buttons">
            <button class="mcp-import-btn" id="mcp-import-url">
              <span>🔗</span>
              <span>Import from URL</span>
            </button>
            <button class="mcp-import-btn" id="mcp-import-file">
              <span>📁</span>
              <span>Import from File</span>
            </button>
          </div>
        </div>
      </div>
    `;

    // Bind events
    container.querySelectorAll('.mcp-type-option').forEach(opt => {
      opt.addEventListener('click', () => {
        this.selectedMcpType = (opt as HTMLElement).dataset.type || null;
        this.mcpDialogMode = 'form';
        this.renderMcpDialogContent();
      });
    });

    container.querySelector('#mcp-import-url')?.addEventListener('click', () => {
      this.showMcpUrlInputDialog();
    });

    container.querySelector('#mcp-import-file')?.addEventListener('click', () => {
      this.importMcpFromFile();
    });
  }

  private renderMcpServerForm(container: HTMLElement): void {
    const server = this.editingMcpServer;
    const isEdit = server !== null;
    const type = isEdit ? server.type : (this.selectedMcpType as MCPServerTemplate['type']);
    const isCustom = type === 'custom';
    const template = isCustom ? null : MCP_TEMPLATES[type];

    let formFields = '';

    // Server name field
    const serverName = server?.name || (isCustom ? '' : template?.name || '');
    formFields += `
      <div class="mcp-form-field">
        <label class="mcp-form-label">Server Name</label>
        <input type="text" class="mcp-form-input" id="mcp-field-name" value="${this.escapeHtml(serverName)}" placeholder="Enter server name">
      </div>
    `;

    if (isCustom) {
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
                <button class="mcp-env-remove">&times;</button>
              </div>
            `).join('')}
          </div>
          <button class="mcp-env-add">+ Add Variable</button>
        </div>
      `;
    } else if (template) {
      for (const field of template.fields) {
        const value = this.getMcpSettingValue(server?.settings, field.key);

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
              <textarea class="mcp-form-textarea" id="mcp-field-${field.key}" rows="4" placeholder="${field.placeholder || ''}">${this.escapeHtml(String(textValue))}</textarea>
            </div>
          `;
        } else {
          formFields += `
            <div class="mcp-form-field">
              <label class="mcp-form-label">${field.label}</label>
              <input type="${field.type}" class="mcp-form-input" id="mcp-field-${field.key}" value="${this.escapeHtml(String(value || ''))}" placeholder="${field.placeholder || ''}">
            </div>
          `;
        }
      }
    }

    container.innerHTML = `
      <div class="mcp-form-body">
        ${formFields}
      </div>
      <div class="mcp-form-footer">
        <button class="mcp-btn-cancel">Cancel</button>
        <button class="mcp-btn-save">${isEdit ? 'Save Changes' : 'Add Server'}</button>
      </div>
    `;

    // Bind events
    container.querySelector('.mcp-btn-cancel')?.addEventListener('click', () => {
      this.hideMcpDialog();
    });

    container.querySelector('.mcp-btn-save')?.addEventListener('click', async () => {
      await this.saveMcpServer();
    });

    // Custom server env var handling
    if (isCustom) {
      container.querySelector('.mcp-env-add')?.addEventListener('click', () => {
        this.addMcpEnvRow(container);
      });

      container.querySelectorAll('.mcp-env-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const row = (e.target as HTMLElement).closest('.mcp-env-row');
          row?.remove();
        });
      });
    }
  }

  private renderMcpImportedForm(container: HTMLElement): void {
    const server = this.editingMcpServer;
    const schema = server?.importedSchema || this.importedMcpSchema;
    if (!schema) {
      this.mcpDialogMode = 'type-select';
      this.renderMcpDialogContent();
      return;
    }

    const isEdit = server !== null;
    const description = schema.description || '';
    const icon = schema.icon || '📦';

    let formFields = '';

    // Server name field
    const serverName = server?.name || schema.name;
    formFields += `
      <div class="mcp-form-field">
        <label class="mcp-form-label">Server Name</label>
        <input type="text" class="mcp-form-input" id="mcp-field-name" value="${this.escapeHtml(serverName)}" placeholder="Enter server name">
      </div>
    `;

    // Dynamic fields from schema
    for (const field of schema.fields) {
      const value = this.getMcpSettingValue(server?.settings, field.key);
      const defaultValue = field.default;
      const displayValue = value !== undefined ? value : defaultValue;
      const requiredMark = field.required ? ' *' : '';

      if (field.type === 'checkbox') {
        const checked = displayValue === true || displayValue === 'true';
        formFields += `
          <div class="mcp-form-field mcp-form-field-checkbox">
            <label class="mcp-form-checkbox-label">
              <input type="checkbox" class="mcp-form-checkbox" id="mcp-field-${field.key}" ${checked ? 'checked' : ''}>
              <span>${field.label}${requiredMark}</span>
            </label>
            ${field.helpText ? `<div class="mcp-help-text">${this.escapeHtml(field.helpText)}</div>` : ''}
          </div>
        `;
      } else if (field.type === 'textarea') {
        const textValue = Array.isArray(displayValue) ? displayValue.join('\n') : (displayValue || '');
        formFields += `
          <div class="mcp-form-field">
            <label class="mcp-form-label">${field.label}${requiredMark}</label>
            <textarea class="mcp-form-textarea" id="mcp-field-${field.key}" rows="4" placeholder="${field.placeholder || ''}">${this.escapeHtml(String(textValue))}</textarea>
            ${field.helpText ? `<div class="mcp-help-text">${this.escapeHtml(field.helpText)}</div>` : ''}
          </div>
        `;
      } else if (field.type === 'number') {
        formFields += `
          <div class="mcp-form-field">
            <label class="mcp-form-label">${field.label}${requiredMark}</label>
            <input type="number" class="mcp-form-input" id="mcp-field-${field.key}" value="${this.escapeHtml(String(displayValue || ''))}" placeholder="${field.placeholder || ''}">
            ${field.helpText ? `<div class="mcp-help-text">${this.escapeHtml(field.helpText)}</div>` : ''}
          </div>
        `;
      } else {
        formFields += `
          <div class="mcp-form-field">
            <label class="mcp-form-label">${field.label}${requiredMark}</label>
            <input type="${field.type}" class="mcp-form-input" id="mcp-field-${field.key}" value="${this.escapeHtml(String(displayValue || ''))}" placeholder="${field.placeholder || ''}">
            ${field.helpText ? `<div class="mcp-help-text">${this.escapeHtml(field.helpText)}</div>` : ''}
          </div>
        `;
      }
    }

    container.innerHTML = `
      ${description ? `<div class="mcp-schema-description">${icon} ${this.escapeHtml(description)}</div>` : ''}
      <div class="mcp-form-body">
        ${formFields}
      </div>
      <div class="mcp-form-footer">
        <button class="mcp-btn-cancel">Cancel</button>
        <button class="mcp-btn-save">${isEdit ? 'Save Changes' : 'Add Server'}</button>
      </div>
    `;

    // Bind events
    container.querySelector('.mcp-btn-cancel')?.addEventListener('click', () => {
      this.hideMcpDialog();
    });

    container.querySelector('.mcp-btn-save')?.addEventListener('click', async () => {
      await this.saveMcpImportedServer();
    });
  }

  private showMcpUrlInputDialog(): void {
    const container = this.element.querySelector('#mcp-dialog-content') as HTMLElement;
    container.innerHTML = `
      <div class="mcp-url-input-section">
        <div class="mcp-form-field">
          <label class="mcp-form-label">Config URL</label>
          <input type="text" class="mcp-form-input" id="mcp-url-input" placeholder="https://example.com/mcp-config.json">
        </div>
        <div id="mcp-url-error" class="mcp-url-error"></div>
        <div class="mcp-form-footer">
          <button class="mcp-btn-cancel">Cancel</button>
          <button class="mcp-btn-submit">Import</button>
        </div>
      </div>
    `;

    const urlInput = container.querySelector('#mcp-url-input') as HTMLInputElement;
    const errorDiv = container.querySelector('#mcp-url-error') as HTMLElement;

    urlInput.focus();

    container.querySelector('.mcp-btn-cancel')?.addEventListener('click', () => {
      this.mcpDialogMode = 'type-select';
      this.renderMcpDialogContent();
    });

    container.querySelector('.mcp-btn-submit')?.addEventListener('click', async () => {
      const url = urlInput.value.trim();
      if (!url) {
        errorDiv.textContent = 'Please enter a URL.';
        return;
      }

      try {
        errorDiv.textContent = 'Loading...';
        const schema = await window.electronAPI.mcpImportSchemaFromUrl(url);
        this.importedMcpSchema = schema;
        this.mcpDialogMode = 'form';
        this.renderMcpDialogContent();
      } catch (error) {
        errorDiv.textContent = error instanceof Error ? error.message : 'Failed to load schema.';
      }
    });

    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        container.querySelector('.mcp-btn-submit')?.dispatchEvent(new Event('click'));
      }
    });
  }

  private async importMcpFromFile(): Promise<void> {
    try {
      const schema = await window.electronAPI.mcpImportSchemaFromFile();
      if (schema) {
        this.importedMcpSchema = schema;
        this.mcpDialogMode = 'form';
        this.renderMcpDialogContent();
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to load file.');
    }
  }

  private addMcpEnvRow(container: HTMLElement): void {
    const envList = container.querySelector('#mcp-env-list');
    if (!envList) return;

    const row = document.createElement('div');
    row.className = 'mcp-env-row';
    row.innerHTML = `
      <input type="text" class="mcp-form-input mcp-env-key" placeholder="KEY">
      <input type="text" class="mcp-form-input mcp-env-value" placeholder="Value">
      <button class="mcp-env-remove">&times;</button>
    `;

    row.querySelector('.mcp-env-remove')?.addEventListener('click', () => {
      row.remove();
    });

    envList.appendChild(row);
  }

  private getMcpSettingValue(settings: MCPServerTemplate['settings'], key: string): string | boolean | string[] | undefined {
    if (!settings) return undefined;
    return (settings as Record<string, unknown>)[key] as string | boolean | string[] | undefined;
  }

  private async saveMcpServer(): Promise<void> {
    const nameInput = this.element.querySelector('#mcp-field-name') as HTMLInputElement;
    const name = nameInput?.value.trim();

    if (!name) {
      alert('Server name is required');
      return;
    }

    const server = this.editingMcpServer;
    const isEdit = server !== null;
    const type = isEdit ? server.type : (this.selectedMcpType as MCPServerTemplate['type']);

    let serverData: Omit<MCPServerTemplate, 'id'>;

    if (type === 'custom') {
      const commandInput = this.element.querySelector('#mcp-field-command') as HTMLInputElement;
      const argsInput = this.element.querySelector('#mcp-field-args') as HTMLTextAreaElement;

      const command = commandInput?.value.trim() || '';
      const args = argsInput?.value.split('\n').map(a => a.trim()).filter(a => a) || [];

      const envRows = this.element.querySelectorAll('.mcp-env-row');
      const env: Record<string, string> = {};
      envRows.forEach(row => {
        const keyInput = row.querySelector('.mcp-env-key') as HTMLInputElement;
        const valueInput = row.querySelector('.mcp-env-value') as HTMLInputElement;
        const key = keyInput?.value.trim();
        const value = valueInput?.value || '';
        if (key) env[key] = value;
      });

      if (!command) {
        alert('Command is required for custom servers');
        return;
      }

      serverData = {
        type: 'custom',
        name,
        enabled: isEdit ? (server.enabled ?? true) : true,
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
        enabled: isEdit ? (server.enabled ?? true) : true,
        settings,
      };
    }

    try {
      if (isEdit && server.id) {
        await window.electronAPI.mcpUpdateServer(server.id, serverData);
      } else {
        await window.electronAPI.mcpAddServer(serverData);
      }
      await this.loadMcpServers();
      this.hideMcpDialog();
    } catch (error) {
      console.error('Failed to save server:', error);
      alert('Failed to save server configuration');
    }
  }

  private async saveMcpImportedServer(): Promise<void> {
    const server = this.editingMcpServer;
    const schema = server?.importedSchema || this.importedMcpSchema;
    if (!schema) return;

    const nameInput = this.element.querySelector('#mcp-field-name') as HTMLInputElement;
    const name = nameInput?.value.trim();

    if (!name) {
      alert('Server name is required');
      return;
    }

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

      if (field.required) {
        const value = settings[field.key];
        if (value === undefined || value === null || value === '') {
          alert(`${field.label} is required.`);
          return;
        }
      }
    }

    try {
      if (server?.id) {
        await window.electronAPI.mcpUpdateServer(server.id, {
          name,
          settings: settings as MCPServerTemplate['settings'],
          importedSchema: schema,
        });
      } else {
        await window.electronAPI.mcpAddServerFromSchema(schema, settings);
      }
      this.importedMcpSchema = null;
      await this.loadMcpServers();
      this.hideMcpDialog();
    } catch (error) {
      console.error('Failed to save server:', error);
      alert('Failed to save server configuration');
    }
  }

  // ==================== Claude Hooks Methods ====================

  private updateHookDialogForEvent(eventName: string): void {
    const eventInfo = HOOK_EVENTS.find(e => e.value === eventName);
    const descSpan = this.element.querySelector('#hook-event-desc') as HTMLElement;
    const matcherField = this.element.querySelector('#hook-matcher-field') as HTMLElement;

    if (eventInfo) {
      descSpan.textContent = eventInfo.description;
      matcherField.style.display = eventInfo.needsMatcher ? 'block' : 'none';
    }
  }

  private showHookDialog(hook?: FlattenedHook): void {
    const dialog = this.element.querySelector('#hook-dialog') as HTMLElement;
    const title = this.element.querySelector('#hook-dialog-title') as HTMLElement;
    const eventSelect = this.element.querySelector('#hook-event') as HTMLSelectElement;
    const matcherInput = this.element.querySelector('#hook-matcher') as HTMLInputElement;
    const typeSelect = this.element.querySelector('#hook-type') as HTMLSelectElement;
    const commandTextarea = this.element.querySelector('#hook-command') as HTMLTextAreaElement;
    const promptTextarea = this.element.querySelector('#hook-prompt') as HTMLTextAreaElement;
    const timeoutInput = this.element.querySelector('#hook-timeout') as HTMLInputElement;

    this.editingHook = hook || null;
    title.textContent = hook ? 'Edit Hook' : 'Add Hook';

    if (hook) {
      eventSelect.value = hook.eventName;
      matcherInput.value = hook.matcher || '';
      typeSelect.value = hook.type;
      commandTextarea.value = hook.command || '';
      promptTextarea.value = hook.prompt || '';
      timeoutInput.value = String(hook.timeout || 60);
    } else {
      eventSelect.value = 'PreToolUse';
      matcherInput.value = '';
      typeSelect.value = 'command';
      commandTextarea.value = '';
      promptTextarea.value = '';
      timeoutInput.value = '60';
    }

    this.updateHookDialogForEvent(eventSelect.value);

    const commandField = this.element.querySelector('#hook-command-field') as HTMLElement;
    const promptField = this.element.querySelector('#hook-prompt-field') as HTMLElement;
    if (typeSelect.value === 'command') {
      commandField.style.display = 'block';
      promptField.style.display = 'none';
    } else {
      commandField.style.display = 'none';
      promptField.style.display = 'block';
    }

    dialog.classList.add('visible');
  }

  private hideHookDialog(): void {
    const dialog = this.element.querySelector('#hook-dialog') as HTMLElement;
    dialog.classList.remove('visible');
    this.editingHook = null;
  }

  private async saveHook(): Promise<void> {
    const eventSelect = this.element.querySelector('#hook-event') as HTMLSelectElement;
    const matcherInput = this.element.querySelector('#hook-matcher') as HTMLInputElement;
    const typeSelect = this.element.querySelector('#hook-type') as HTMLSelectElement;
    const commandTextarea = this.element.querySelector('#hook-command') as HTMLTextAreaElement;
    const promptTextarea = this.element.querySelector('#hook-prompt') as HTMLTextAreaElement;
    const timeoutInput = this.element.querySelector('#hook-timeout') as HTMLInputElement;

    const eventName = eventSelect.value;
    const eventInfo = HOOK_EVENTS.find(e => e.value === eventName);
    const matcher = eventInfo?.needsMatcher ? (matcherInput.value.trim() || undefined) : undefined;
    const type = typeSelect.value as 'command' | 'prompt';
    const command = type === 'command' ? commandTextarea.value.trim() : undefined;
    const prompt = type === 'prompt' ? promptTextarea.value.trim() : undefined;
    const timeout = parseInt(timeoutInput.value) || 60;

    if (type === 'command' && !command) {
      alert('Please enter a command.');
      return;
    }
    if (type === 'prompt' && !prompt) {
      alert('Please enter a prompt.');
      return;
    }

    const hookConfig = {
      type,
      command,
      prompt,
      timeout: timeout !== 60 ? timeout : undefined,
    };

    try {
      if (this.editingHook) {
        this.claudeHooks = await (window as any).electronAPI.updateClaudeHook(
          this.editingHook.eventName,
          this.editingHook.entryIndex,
          this.editingHook.hookIndex,
          matcher,
          hookConfig
        );
      } else {
        this.claudeHooks = await (window as any).electronAPI.addClaudeHook(eventName, matcher, hookConfig);
      }
      this.renderClaudeHooks();
      this.hideHookDialog();
    } catch (error) {
      console.error('Failed to save hook:', error);
      alert('Failed to save hook. Check console for details.');
    }
  }

  private async deleteHook(hook: FlattenedHook): Promise<void> {
    if (!confirm(`Delete this hook?\n\n${hook.eventName} · ${hook.matcher || '(no matcher)'}`)) {
      return;
    }

    try {
      this.claudeHooks = await (window as any).electronAPI.removeClaudeHook(
        hook.eventName,
        hook.entryIndex,
        hook.hookIndex
      );
      this.renderClaudeHooks();
    } catch (error) {
      console.error('Failed to delete hook:', error);
      alert('Failed to delete hook. Check console for details.');
    }
  }

  private renderClaudeHooks(): void {
    const container = this.element.querySelector('#claude-hooks-list') as HTMLElement;
    if (!container) return;

    if (this.claudeHooks.length === 0) {
      container.innerHTML = `
        <div class="claude-hooks-empty">
          No hooks configured. Click "+ Add Hook" to create one.
        </div>
      `;
      return;
    }

    container.innerHTML = this.claudeHooks.map(hook => `
      <div class="claude-hook-item" data-hook-id="${hook.id}">
        <div class="claude-hook-header">
          <span class="claude-hook-event">${hook.eventName}</span>
          ${hook.matcher ? `<span class="claude-hook-matcher">${hook.matcher}</span>` : ''}
        </div>
        <div class="claude-hook-command">${hook.type === 'command' ? hook.command : hook.prompt}</div>
        <div class="claude-hook-actions">
          <button class="claude-hook-edit" data-hook-id="${hook.id}">Edit</button>
          <button class="claude-hook-delete" data-hook-id="${hook.id}">Delete</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.claude-hook-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const hookId = (e.target as HTMLElement).dataset.hookId;
        const hook = this.claudeHooks.find(h => h.id === hookId);
        if (hook) this.showHookDialog(hook);
      });
    });

    container.querySelectorAll('.claude-hook-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const hookId = (e.target as HTMLElement).dataset.hookId;
        const hook = this.claudeHooks.find(h => h.id === hookId);
        if (hook) this.deleteHook(hook);
      });
    });
  }

  private async loadClaudeHooks(): Promise<void> {
    try {
      this.claudeHooks = await (window as any).electronAPI.getClaudeHooks();
      this.renderClaudeHooks();
    } catch (error) {
      console.error('Failed to load Claude hooks:', error);
    }
  }

  // ==================== Common Methods ====================

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private notifyUpdate(): void {
    if (this.settings && this.onUpdate) {
      this.onUpdate({ ...this.settings });
    }
  }

  private updateUI(): void {
    if (!this.settings) return;

    const themeSelect = this.element.querySelector('#setting-theme') as HTMLSelectElement;
    if (themeSelect) themeSelect.value = this.settings.theme;

    const fontFamilySelect = this.element.querySelector('#setting-font-family') as HTMLSelectElement;
    if (fontFamilySelect) {
      const options = Array.from(fontFamilySelect.options);
      const match = options.find(opt => opt.value === this.settings!.fontFamily);
      if (match) fontFamilySelect.value = match.value;
    }

    const fontSizeSlider = this.element.querySelector('#setting-font-size') as HTMLInputElement;
    const fontSizeValue = this.element.querySelector('#setting-font-size-value') as HTMLSpanElement;
    if (fontSizeSlider) fontSizeSlider.value = String(this.settings.fontSize);
    if (fontSizeValue) fontSizeValue.textContent = `${this.settings.fontSize}px`;

    const idleToggle = this.element.querySelector('#setting-idle-notification') as HTMLInputElement;
    const idleTimeoutSetting = this.element.querySelector('#idle-timeout-setting') as HTMLElement;
    if (idleToggle) {
      idleToggle.checked = this.settings.idleNotification.enabled;
      if (idleTimeoutSetting) {
        idleTimeoutSetting.style.opacity = this.settings.idleNotification.enabled ? '1' : '0.5';
      }
    }

    const idleTimeoutSlider = this.element.querySelector('#setting-idle-timeout') as HTMLInputElement;
    const idleTimeoutValue = this.element.querySelector('#setting-idle-timeout-value') as HTMLSpanElement;
    if (idleTimeoutSlider) idleTimeoutSlider.value = String(this.settings.idleNotification.timeoutSeconds);
    if (idleTimeoutValue) idleTimeoutValue.textContent = `${this.settings.idleNotification.timeoutSeconds}s`;
  }

  show(settings: Settings, onUpdate: SettingsUpdateCallback): void {
    this.settings = { ...settings };
    this.onUpdate = onUpdate;
    this.updateUI();
    this.switchTab('general');
    this.isVisible = true;
    this.element.classList.add('visible');
  }

  showTab(tabId: TabId, settings: Settings, onUpdate: SettingsUpdateCallback): void {
    this.settings = { ...settings };
    this.onUpdate = onUpdate;
    this.updateUI();
    this.switchTab(tabId);
    this.isVisible = true;
    this.element.classList.add('visible');
  }

  hide(): void {
    this.isVisible = false;
    this.element.classList.remove('visible');
    this.onUpdate = null;
  }

  toggle(settings: Settings, onUpdate: SettingsUpdateCallback): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show(settings, onUpdate);
    }
  }
}

export const settingsPanel = new SettingsPanel();
