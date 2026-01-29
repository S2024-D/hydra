// Hydra Gateway Status Panel
// This module provides UI for managing the Hydra MCP Gateway

interface GatewayStatus {
  running: boolean;
  port: number;
  servers: Array<{
    id: string;
    name: string;
    status: 'starting' | 'ready' | 'error' | 'stopped';
    toolCount: number;
    error?: string;
  }>;
  totalTools: number;
}

interface HydraTool {
  name: string;
  serverName: string;
  description?: string;
}

class HydraStatusPanel {
  private panel: HTMLElement | null = null;
  private status: GatewayStatus | null = null;
  private tools: HydraTool[] = [];
  private isVisible = false;

  constructor() {
    this.createPanel();
    this.setupEventListeners();
    // Delay initial status load to ensure API is ready
    setTimeout(() => this.loadInitialStatus(), 100);
  }

  private get api() {
    return (window as any).electronAPI;
  }

  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'hydra-panel';
    this.panel.innerHTML = `
      <div class="hydra-panel-backdrop"></div>
      <div class="hydra-panel-container">
        <div class="hydra-panel-header">
          <h2 class="hydra-panel-title">Hydra MCP Gateway</h2>
          <button class="hydra-panel-close">&times;</button>
        </div>
        <div class="hydra-panel-content">
          <div class="hydra-status-section">
            <div class="hydra-status-header">
              <div class="hydra-status-info">
                <span class="hydra-status-indicator"></span>
                <span class="hydra-status-text">Stopped</span>
              </div>
              <div class="hydra-status-actions">
                <button class="hydra-btn hydra-btn-start">Start Gateway</button>
                <button class="hydra-btn hydra-btn-stop" style="display: none;">Stop Gateway</button>
                <button class="hydra-btn hydra-btn-refresh" style="display: none;">Refresh</button>
              </div>
            </div>
            <div class="hydra-connection-info" style="display: none;">
              <div class="hydra-connection-url">
                <span class="hydra-label">Connection URL:</span>
                <code class="hydra-url">http://localhost:3999/mcp</code>
                <button class="hydra-btn-copy" title="Copy URL">Copy</button>
              </div>
              <div class="hydra-connection-hint">
                Add to Claude CLI: <code>claude mcp add --transport http hydra http://localhost:3999/mcp</code>
              </div>
            </div>
          </div>

          <div class="hydra-servers-section">
            <div class="hydra-section-header">
              <span class="hydra-section-title">Connected Servers</span>
              <span class="hydra-server-count">0 servers</span>
            </div>
            <div class="hydra-server-list">
              <div class="hydra-empty">No servers connected. Enable MCP servers in settings.</div>
            </div>
          </div>

          <div class="hydra-tools-section">
            <div class="hydra-section-header">
              <span class="hydra-section-title">Available Tools</span>
              <span class="hydra-tool-count">0 tools</span>
            </div>
            <div class="hydra-tool-list">
              <div class="hydra-empty">No tools available.</div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(this.panel);

    // Add click handlers
    this.panel.querySelector('.hydra-panel-backdrop')?.addEventListener('click', () => this.hide());
    this.panel.querySelector('.hydra-panel-close')?.addEventListener('click', () => this.hide());
    this.panel.querySelector('.hydra-btn-start')?.addEventListener('click', () => this.startGateway());
    this.panel.querySelector('.hydra-btn-stop')?.addEventListener('click', () => this.stopGateway());
    this.panel.querySelector('.hydra-btn-refresh')?.addEventListener('click', () => this.refreshGateway());
    this.panel.querySelector('.hydra-btn-copy')?.addEventListener('click', () => this.copyUrl());
  }

  private setupEventListeners(): void {
    // Listen for status changes from main process
    this.api.onHydraStatusChange((status: GatewayStatus) => {
      this.status = status;
      this.updateUI();
      if (status.running) {
        this.loadTools();
      }
    });

    this.api.onHydraServerStateChange((data: { serverId: string; serverName: string; status: string; error?: string }) => {
      console.log('[Hydra] Server state change:', data);
      // Reload status when server state changes
      this.loadStatus();
    });

    // Keyboard shortcut is handled by command registry in renderer.ts
  }

  private async loadInitialStatus(): Promise<void> {
    await this.loadStatus();
  }

  private async loadStatus(): Promise<void> {
    try {
      this.status = await this.api.hydraGetStatus();
      this.updateUI();
      if (this.status && this.status.running) {
        await this.loadTools();
      }
    } catch (error) {
      console.error('[Hydra] Failed to load status:', error);
    }
  }

  private async loadTools(): Promise<void> {
    try {
      this.tools = await this.api.hydraGetTools();
      this.updateToolsUI();
    } catch (error) {
      console.error('[Hydra] Failed to load tools:', error);
    }
  }

  private async startGateway(): Promise<void> {
    const startBtn = this.panel?.querySelector('.hydra-btn-start') as HTMLButtonElement;
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.textContent = 'Starting...';
    }

    try {
      this.status = await this.api.hydraStart();
      this.updateUI();
      await this.loadTools();
    } catch (error) {
      console.error('[Hydra] Failed to start gateway:', error);
      alert(`Failed to start gateway: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.textContent = 'Start Gateway';
      }
    }
  }

  private async stopGateway(): Promise<void> {
    const stopBtn = this.panel?.querySelector('.hydra-btn-stop') as HTMLButtonElement;
    if (stopBtn) {
      stopBtn.disabled = true;
      stopBtn.textContent = 'Stopping...';
    }

    try {
      await this.api.hydraStop();
      this.status = await this.api.hydraGetStatus();
      this.tools = [];
      this.updateUI();
    } catch (error) {
      console.error('[Hydra] Failed to stop gateway:', error);
    } finally {
      if (stopBtn) {
        stopBtn.disabled = false;
        stopBtn.textContent = 'Stop Gateway';
      }
    }
  }

  private async refreshGateway(): Promise<void> {
    const refreshBtn = this.panel?.querySelector('.hydra-btn-refresh') as HTMLButtonElement;
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Refreshing...';
    }

    try {
      this.status = await this.api.hydraRefresh();
      this.updateUI();
      await this.loadTools();
    } catch (error) {
      console.error('[Hydra] Failed to refresh gateway:', error);
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'Refresh';
      }
    }
  }

  private copyUrl(): void {
    const url = `http://localhost:${this.status?.port || 3999}/mcp`;
    navigator.clipboard.writeText(url).then(() => {
      const copyBtn = this.panel?.querySelector('.hydra-btn-copy') as HTMLButtonElement;
      if (copyBtn) {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = originalText;
        }, 1500);
      }
    });
  }

  private updateUI(): void {
    if (!this.panel || !this.status) return;

    const isRunning = this.status.running;

    // Update status indicator
    const indicator = this.panel.querySelector('.hydra-status-indicator') as HTMLElement;
    const statusText = this.panel.querySelector('.hydra-status-text') as HTMLElement;
    if (indicator && statusText) {
      indicator.className = `hydra-status-indicator ${isRunning ? 'running' : 'stopped'}`;
      statusText.textContent = isRunning ? `Running on port ${this.status.port}` : 'Stopped';
    }

    // Update buttons visibility
    const startBtn = this.panel.querySelector('.hydra-btn-start') as HTMLElement;
    const stopBtn = this.panel.querySelector('.hydra-btn-stop') as HTMLElement;
    const refreshBtn = this.panel.querySelector('.hydra-btn-refresh') as HTMLElement;
    if (startBtn) startBtn.style.display = isRunning ? 'none' : 'inline-block';
    if (stopBtn) stopBtn.style.display = isRunning ? 'inline-block' : 'none';
    if (refreshBtn) refreshBtn.style.display = isRunning ? 'inline-block' : 'none';

    // Update connection info visibility
    const connectionInfo = this.panel.querySelector('.hydra-connection-info') as HTMLElement;
    if (connectionInfo) {
      connectionInfo.style.display = isRunning ? 'block' : 'none';
    }

    // Update URL
    const urlElement = this.panel.querySelector('.hydra-url') as HTMLElement;
    if (urlElement) {
      urlElement.textContent = `http://localhost:${this.status.port}/mcp`;
    }

    // Update hint
    const hintElement = this.panel.querySelector('.hydra-connection-hint code') as HTMLElement;
    if (hintElement) {
      hintElement.textContent = `claude mcp add --transport http hydra http://localhost:${this.status.port}/mcp`;
    }

    // Update servers
    this.updateServersUI();
  }

  private updateServersUI(): void {
    if (!this.panel || !this.status) return;

    const serverCount = this.panel.querySelector('.hydra-server-count') as HTMLElement;
    const serverList = this.panel.querySelector('.hydra-server-list') as HTMLElement;

    if (serverCount) {
      serverCount.textContent = `${this.status.servers.length} server${this.status.servers.length !== 1 ? 's' : ''}`;
    }

    if (serverList) {
      if (this.status.servers.length === 0) {
        serverList.innerHTML = '<div class="hydra-empty">No servers connected. Enable MCP servers in settings.</div>';
      } else {
        serverList.innerHTML = this.status.servers.map(server => `
          <div class="hydra-server-item">
            <div class="hydra-server-status ${server.status}"></div>
            <div class="hydra-server-info">
              <span class="hydra-server-name">${this.escapeHtml(server.name)}</span>
              <span class="hydra-server-meta">${server.toolCount} tool${server.toolCount !== 1 ? 's' : ''} ${server.status !== 'ready' ? `• ${server.status}` : ''}</span>
              ${server.error ? `<span class="hydra-server-error">${this.escapeHtml(server.error)}</span>` : ''}
            </div>
          </div>
        `).join('');
      }
    }
  }

  private updateToolsUI(): void {
    if (!this.panel) return;

    const toolCount = this.panel.querySelector('.hydra-tool-count') as HTMLElement;
    const toolList = this.panel.querySelector('.hydra-tool-list') as HTMLElement;

    if (toolCount) {
      toolCount.textContent = `${this.tools.length} tool${this.tools.length !== 1 ? 's' : ''}`;
    }

    if (toolList) {
      if (this.tools.length === 0) {
        toolList.innerHTML = '<div class="hydra-empty">No tools available.</div>';
      } else {
        // Group tools by server
        const toolsByServer = new Map<string, HydraTool[]>();
        for (const tool of this.tools) {
          const existing = toolsByServer.get(tool.serverName) || [];
          existing.push(tool);
          toolsByServer.set(tool.serverName, existing);
        }

        let html = '';
        for (const [serverName, serverTools] of toolsByServer) {
          html += `<div class="hydra-tool-group">
            <div class="hydra-tool-group-header">${this.escapeHtml(serverName)} (${serverTools.length})</div>
            ${serverTools.map(tool => `
              <div class="hydra-tool-item">
                <span class="hydra-tool-name">${this.escapeHtml(tool.name)}</span>
                ${tool.description ? `<span class="hydra-tool-desc">${this.escapeHtml(tool.description)}</span>` : ''}
              </div>
            `).join('')}
          </div>`;
        }
        toolList.innerHTML = html;
      }
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  show(): void {
    if (this.panel) {
      this.panel.classList.add('visible');
      this.isVisible = true;
      this.loadStatus();
    }
  }

  hide(): void {
    if (this.panel) {
      this.panel.classList.remove('visible');
      this.isVisible = false;
    }
  }

  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }
}

// Initialize after DOM is ready
let hydraStatusPanelInstance: HydraStatusPanel | null = null;

function initHydraStatusPanel(): HydraStatusPanel {
  if (!hydraStatusPanelInstance) {
    hydraStatusPanelInstance = new HydraStatusPanel();
    (window as any).hydraStatusPanel = hydraStatusPanelInstance;
  }
  return hydraStatusPanelInstance;
}

// Export a lazy-initialized panel
export const hydraStatusPanel = {
  show: () => initHydraStatusPanel().show(),
  hide: () => initHydraStatusPanel().hide(),
  toggle: () => initHydraStatusPanel().toggle(),
};
