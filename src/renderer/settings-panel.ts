import { mcpSettings } from './mcp-settings';

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

export class SettingsPanel {
  private element: HTMLElement;
  private isVisible = false;
  private settings: Settings | null = null;
  private onUpdate: SettingsUpdateCallback | null = null;
  private claudeHooks: FlattenedHook[] = [];
  private editingHook: FlattenedHook | null = null;

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
      <div class="settings-panel-container">
        <div class="settings-panel-header">
          <h2 class="settings-panel-title">Settings</h2>
          <button class="settings-panel-close">&times;</button>
        </div>
        <div class="settings-panel-content">
          <!-- Appearance Section -->
          <div class="settings-section">
            <h3 class="settings-section-title">Appearance</h3>

            <div class="settings-item">
              <label class="settings-label">Theme</label>
              <div class="settings-control">
                <select id="setting-theme" class="settings-select">
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </div>
            </div>

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

          <!-- Notifications Section -->
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

          <!-- Claude Code Hooks Section -->
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

          <!-- MCP Section -->
          <div class="settings-section">
            <h3 class="settings-section-title">MCP Servers</h3>
            <div class="settings-item">
              <label class="settings-label">
                Model Context Protocol
                <span class="settings-hint">Configure MCP servers for AI assistant integration</span>
              </label>
              <div class="settings-control">
                <button class="settings-mcp-btn" id="open-mcp-settings">Open MCP Settings</button>
              </div>
            </div>
          </div>

          <!-- Keyboard Shortcuts Section -->
          <div class="settings-section">
            <h3 class="settings-section-title">Keyboard Shortcuts</h3>
            <div class="shortcuts-list">
              <div class="shortcut-item">
                <span class="shortcut-label">New Terminal</span>
                <span class="shortcut-key">&#8984;T</span>
              </div>
              <div class="shortcut-item">
                <span class="shortcut-label">Close Terminal</span>
                <span class="shortcut-key">&#8984;W</span>
              </div>
              <div class="shortcut-item">
                <span class="shortcut-label">Split Right</span>
                <span class="shortcut-key">&#8984;\\</span>
              </div>
              <div class="shortcut-item">
                <span class="shortcut-label">Split Down</span>
                <span class="shortcut-key">&#8984;&#8679;\\</span>
              </div>
              <div class="shortcut-item">
                <span class="shortcut-label">Command Palette</span>
                <span class="shortcut-key">&#8984;&#8679;P</span>
              </div>
              <div class="shortcut-item">
                <span class="shortcut-label">Settings</span>
                <span class="shortcut-key">&#8984;,</span>
              </div>
              <div class="shortcut-item">
                <span class="shortcut-label">Next Project</span>
                <span class="shortcut-key">&#8984;&#8997;]</span>
              </div>
              <div class="shortcut-item">
                <span class="shortcut-label">Previous Project</span>
                <span class="shortcut-key">&#8984;&#8997;[</span>
              </div>
              <div class="shortcut-item">
                <span class="shortcut-label">Switch Terminal (MRU)</span>
                <span class="shortcut-key">&#8963;Tab</span>
              </div>
              <div class="shortcut-item">
                <span class="shortcut-label">Focus Panel 1/2/3</span>
                <span class="shortcut-key">&#8984;1/2/3</span>
              </div>
              <div class="shortcut-item">
                <span class="shortcut-label">Image Attachments</span>
                <span class="shortcut-key">&#8984;I</span>
              </div>
              <div class="shortcut-item">
                <span class="shortcut-label">MCP Server Settings</span>
                <span class="shortcut-key">&#8984;&#8679;,</span>
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
    `;
    return panel;
  }

  private setupEventListeners(): void {
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

    // MCP Settings button
    this.element.querySelector('#open-mcp-settings')?.addEventListener('click', () => {
      this.hide();
      mcpSettings.show();
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
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

    // Hook dialog: Close button
    this.element.querySelector('.hook-dialog-close')?.addEventListener('click', () => {
      this.hideHookDialog();
    });

    // Hook dialog: Backdrop click
    this.element.querySelector('.hook-dialog-backdrop')?.addEventListener('click', () => {
      this.hideHookDialog();
    });

    // Hook dialog: Event type change
    const hookEventSelect = this.element.querySelector('#hook-event') as HTMLSelectElement;
    hookEventSelect?.addEventListener('change', () => {
      this.updateHookDialogForEvent(hookEventSelect.value);
    });

    // Hook dialog: Type change
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

    // Hook dialog: Cancel
    this.element.querySelector('#hook-cancel-btn')?.addEventListener('click', () => {
      this.hideHookDialog();
    });

    // Hook dialog: Save
    this.element.querySelector('#hook-save-btn')?.addEventListener('click', () => {
      this.saveHook();
    });
  }

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

    // Show/hide command/prompt fields based on type
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

    // Add event listeners
    container.querySelectorAll('.claude-hook-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const hookId = (e.target as HTMLElement).dataset.hookId;
        const hook = this.claudeHooks.find(h => h.id === hookId);
        if (hook) {
          this.showHookDialog(hook);
        }
      });
    });

    container.querySelectorAll('.claude-hook-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const hookId = (e.target as HTMLElement).dataset.hookId;
        const hook = this.claudeHooks.find(h => h.id === hookId);
        if (hook) {
          this.deleteHook(hook);
        }
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

  private notifyUpdate(): void {
    if (this.settings && this.onUpdate) {
      this.onUpdate({ ...this.settings });
    }
  }

  private updateUI(): void {
    if (!this.settings) return;

    // Theme
    const themeSelect = this.element.querySelector('#setting-theme') as HTMLSelectElement;
    if (themeSelect) themeSelect.value = this.settings.theme;

    // Font family - find matching option or use first
    const fontFamilySelect = this.element.querySelector('#setting-font-family') as HTMLSelectElement;
    if (fontFamilySelect) {
      const options = Array.from(fontFamilySelect.options);
      const match = options.find(opt => opt.value === this.settings!.fontFamily);
      if (match) {
        fontFamilySelect.value = match.value;
      }
    }

    // Font size
    const fontSizeSlider = this.element.querySelector('#setting-font-size') as HTMLInputElement;
    const fontSizeValue = this.element.querySelector('#setting-font-size-value') as HTMLSpanElement;
    if (fontSizeSlider) fontSizeSlider.value = String(this.settings.fontSize);
    if (fontSizeValue) fontSizeValue.textContent = `${this.settings.fontSize}px`;

    // Idle notification
    const idleToggle = this.element.querySelector('#setting-idle-notification') as HTMLInputElement;
    const idleTimeoutSetting = this.element.querySelector('#idle-timeout-setting') as HTMLElement;
    if (idleToggle) {
      idleToggle.checked = this.settings.idleNotification.enabled;
      if (idleTimeoutSetting) {
        idleTimeoutSetting.style.opacity = this.settings.idleNotification.enabled ? '1' : '0.5';
      }
    }

    // Idle timeout
    const idleTimeoutSlider = this.element.querySelector('#setting-idle-timeout') as HTMLInputElement;
    const idleTimeoutValue = this.element.querySelector('#setting-idle-timeout-value') as HTMLSpanElement;
    if (idleTimeoutSlider) idleTimeoutSlider.value = String(this.settings.idleNotification.timeoutSeconds);
    if (idleTimeoutValue) idleTimeoutValue.textContent = `${this.settings.idleNotification.timeoutSeconds}s`;
  }

  show(settings: Settings, onUpdate: SettingsUpdateCallback): void {
    this.settings = { ...settings };
    this.onUpdate = onUpdate;
    this.updateUI();
    this.loadClaudeHooks();
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
