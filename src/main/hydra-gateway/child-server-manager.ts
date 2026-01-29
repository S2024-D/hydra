import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';
import { EventEmitter } from 'events';
import {
  ChildServerConfig,
  ChildServerState,
  JsonRpcRequest,
  JsonRpcResponse,
  MCPTool,
  MCPInitializeResult,
  MCPToolsListResult,
} from './types';

const PROTOCOL_VERSION = '2024-11-05';

interface PendingRequest {
  resolve: (response: JsonRpcResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class ChildServerManager extends EventEmitter {
  private config: ChildServerConfig;
  private process: ChildProcess | null = null;
  private readline: Interface | null = null;
  private state: ChildServerState;
  private requestId = 0;
  private pendingRequests = new Map<number | string, PendingRequest>();
  private outputBuffer = '';

  constructor(config: ChildServerConfig) {
    super();
    this.config = config;
    this.state = {
      config,
      status: 'stopped',
      tools: [],
    };
  }

  getState(): ChildServerState {
    return { ...this.state };
  }

  getTools(): MCPTool[] {
    return [...this.state.tools];
  }

  async start(): Promise<void> {
    if (this.process) {
      throw new Error('Server already running');
    }

    this.state.status = 'starting';
    this.state.error = undefined;
    this.emit('stateChange', this.state);

    try {
      // Spawn the child process
      this.process = spawn(this.config.command, this.config.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...this.config.env },
      });

      // Set up readline for line-buffered reading
      this.readline = createInterface({
        input: this.process.stdout!,
        crlfDelay: Infinity,
      });

      // Handle incoming lines (JSON-RPC responses)
      this.readline.on('line', (line) => {
        this.handleLine(line);
      });

      // Handle stderr for debugging
      this.process.stderr?.on('data', (data) => {
        console.error(`[${this.config.name}] stderr:`, data.toString());
      });

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        console.log(`[${this.config.name}] Process exited with code ${code}, signal ${signal}`);
        this.cleanup();
        if (this.state.status !== 'stopped') {
          this.state.status = 'error';
          this.state.error = `Process exited unexpectedly (code: ${code})`;
          this.emit('stateChange', this.state);
        }
      });

      this.process.on('error', (err) => {
        console.error(`[${this.config.name}] Process error:`, err);
        this.state.status = 'error';
        this.state.error = err.message;
        this.emit('stateChange', this.state);
        this.cleanup();
      });

      // Wait for process to be ready
      await this.waitForReady();

      // Initialize the MCP connection
      await this.initialize();

      // Fetch tools
      await this.fetchTools();

      this.state.status = 'ready';
      this.emit('stateChange', this.state);
    } catch (error) {
      this.state.status = 'error';
      this.state.error = error instanceof Error ? error.message : String(error);
      this.emit('stateChange', this.state);
      this.cleanup();
      throw error;
    }
  }

  private waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for process to start'));
      }, 10000);

      // Check if process is running
      const checkReady = () => {
        if (this.process && this.process.pid && !this.process.killed) {
          clearTimeout(timeout);
          // Give process a moment to initialize
          setTimeout(resolve, 100);
        } else if (!this.process || this.process.killed) {
          clearTimeout(timeout);
          reject(new Error('Process failed to start'));
        } else {
          setTimeout(checkReady, 100);
        }
      };

      checkReady();
    });
  }

  private async initialize(): Promise<MCPInitializeResult> {
    const response = await this.sendRequest<MCPInitializeResult>('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        roots: { listChanged: true },
      },
      clientInfo: {
        name: 'hydra-gateway',
        version: '1.0.0',
      },
    });

    // Send initialized notification
    this.sendNotification('notifications/initialized', {});

    return response;
  }

  private async fetchTools(): Promise<void> {
    const result = await this.sendRequest<MCPToolsListResult>('tools/list', {});
    this.state.tools = result.tools || [];
    console.log(`[${this.config.name}] Fetched ${this.state.tools.length} tools`);
  }

  async callTool(name: string, args?: Record<string, unknown>): Promise<unknown> {
    if (this.state.status !== 'ready') {
      throw new Error(`Server ${this.config.name} is not ready`);
    }

    return this.sendRequest('tools/call', {
      name,
      arguments: args,
    });
  }

  private handleLine(line: string): void {
    if (!line.trim()) return;

    try {
      const message = JSON.parse(line) as JsonRpcResponse;

      // Check if this is a response to a pending request
      if (message.id !== undefined) {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(message.id);
          pending.resolve(message);
        }
      } else {
        // This is a notification from the server
        this.emit('notification', message);
      }
    } catch (error) {
      console.error(`[${this.config.name}] Failed to parse message:`, line, error);
    }
  }

  private sendRequest<T>(method: string, params: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin?.writable) {
        reject(new Error('Process stdin not writable'));
        return;
      }

      const id = ++this.requestId;
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout for method: ${method}`));
      }, 30000);

      this.pendingRequests.set(id, {
        resolve: (response: JsonRpcResponse) => {
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result as T);
          }
        },
        reject,
        timeout,
      });

      const message = JSON.stringify(request) + '\n';
      this.process.stdin.write(message);
    });
  }

  private sendNotification(method: string, params: Record<string, unknown>): void {
    if (!this.process?.stdin?.writable) {
      return;
    }

    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const message = JSON.stringify(notification) + '\n';
    this.process.stdin.write(message);
  }

  async stop(): Promise<void> {
    this.state.status = 'stopped';
    this.emit('stateChange', this.state);
    this.cleanup();
  }

  private cleanup(): void {
    // Clear all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Server stopped'));
    }
    this.pendingRequests.clear();

    // Close readline
    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }

    // Kill the process
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  isReady(): boolean {
    return this.state.status === 'ready';
  }
}
