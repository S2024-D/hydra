import { EventEmitter } from 'events';
import { mcpManager } from '../mcp-manager';
import { ChildServerManager } from './child-server-manager';
import { ToolRegistry, toolRegistry } from './tool-registry';
import { HTTPServer } from './http-server';
import { GatewayStatus, ChildServerConfig } from './types';

const DEFAULT_PORT = 3999;

export class GatewayManager extends EventEmitter {
  private httpServer: HTTPServer | null = null;
  private childServers = new Map<string, ChildServerManager>();
  private port: number;
  private running = false;

  constructor(port: number = DEFAULT_PORT) {
    super();
    this.port = port;
  }

  async start(): Promise<GatewayStatus> {
    if (this.running) {
      throw new Error('Gateway is already running');
    }

    console.log('[Gateway Manager] Starting gateway...');

    try {
      // Clear previous state
      toolRegistry.clear();
      this.childServers.clear();

      // Get enabled server commands from MCP manager
      const enabledServers = mcpManager.getEnabledServerCommands();
      console.log(`[Gateway Manager] Found ${enabledServers.length} enabled servers`);

      // Start child servers
      const startPromises = enabledServers.map(async ({ server, command }) => {
        const config: ChildServerConfig = {
          id: server.id,
          name: server.name,
          command: command.command,
          args: command.args,
          env: command.env,
        };

        const manager = new ChildServerManager(config);

        // Listen for state changes
        manager.on('stateChange', (state) => {
          this.emit('serverStateChange', {
            serverId: config.id,
            serverName: config.name,
            status: state.status,
            error: state.error,
          });
        });

        this.childServers.set(config.id, manager);

        try {
          await manager.start();
          toolRegistry.registerServer(manager);
          console.log(`[Gateway Manager] Started server: ${config.name}`);
        } catch (error) {
          console.error(`[Gateway Manager] Failed to start server ${config.name}:`, error);
          // Don't throw - let other servers continue
        }
      });

      // Wait for all servers to start (or fail)
      await Promise.allSettled(startPromises);

      // Start HTTP server
      this.httpServer = new HTTPServer(this.port, toolRegistry);
      await this.httpServer.start();

      this.running = true;
      const status = this.getStatus();
      this.emit('started', status);
      console.log(`[Gateway Manager] Gateway started with ${status.totalTools} tools from ${status.servers.length} servers`);

      return status;
    } catch (error) {
      // Cleanup on failure
      await this.cleanup();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    console.log('[Gateway Manager] Stopping gateway...');
    await this.cleanup();
    this.running = false;
    this.emit('stopped');
    console.log('[Gateway Manager] Gateway stopped');
  }

  private async cleanup(): Promise<void> {
    // Stop HTTP server
    if (this.httpServer) {
      await this.httpServer.stop();
      this.httpServer = null;
    }

    // Stop all child servers
    const stopPromises = Array.from(this.childServers.values()).map(
      manager => manager.stop()
    );
    await Promise.allSettled(stopPromises);

    this.childServers.clear();
    toolRegistry.clear();
  }

  async refresh(): Promise<GatewayStatus> {
    console.log('[Gateway Manager] Refreshing gateway...');
    await this.stop();
    return this.start();
  }

  getStatus(): GatewayStatus {
    const servers = Array.from(this.childServers.entries()).map(([id, manager]) => {
      const state = manager.getState();
      return {
        id,
        name: state.config.name,
        status: state.status,
        toolCount: state.tools.length,
        error: state.error,
      };
    });

    return {
      running: this.running,
      port: this.port,
      servers,
      totalTools: toolRegistry.getToolCount(),
    };
  }

  isRunning(): boolean {
    return this.running;
  }

  getPort(): number {
    return this.port;
  }

  setPort(port: number): void {
    if (this.running) {
      throw new Error('Cannot change port while gateway is running');
    }
    this.port = port;
  }

  // Get the list of available tools (for UI display)
  getTools(): Array<{ name: string; serverName: string; description?: string }> {
    return toolRegistry.getAllTools().map(tool => {
      const namespacedTool = toolRegistry.getTool(tool.name);
      return {
        name: tool.name,
        serverName: namespacedTool?.serverName ?? 'unknown',
        description: tool.description,
      };
    });
  }
}

// Singleton instance
export const gatewayManager = new GatewayManager();
