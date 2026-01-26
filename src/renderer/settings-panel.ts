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

export class SettingsPanel {
  private element: HTMLElement;
  private isVisible = false;
  private settings: Settings | null = null;
  private onUpdate: SettingsUpdateCallback | null = null;

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
            </div>
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

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        e.preventDefault();
        this.hide();
      }
    });
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
