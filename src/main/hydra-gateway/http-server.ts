import * as http from 'http';
import { EventEmitter } from 'events';
import {
  JsonRpcRequest,
  JsonRpcResponse,
  MCPTool,
  MCPToolCallResult,
  MCPInitializeResult,
  MCPServerCapabilities,
  HooksListResult,
  HooksAddParams,
  HooksUpdateParams,
  HooksRemoveParams,
} from './types';
import { ToolRegistry } from './tool-registry';
import { claudeSettingsManager } from '../claude-settings-manager';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'hydra-gateway';
const SERVER_VERSION = '1.0.0';

export class HTTPServer extends EventEmitter {
  private server: http.Server | null = null;
  private port: number;
  private toolRegistry: ToolRegistry;
  private sessionId: string;

  constructor(port: number, toolRegistry: ToolRegistry) {
    super();
    this.port = port;
    this.toolRegistry = toolRegistry;
    this.sessionId = this.generateSessionId();
  }

  private generateSessionId(): string {
    return `hydra-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  async start(): Promise<void> {
    if (this.server) {
      throw new Error('Server already running');
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${this.port} is already in use`));
        } else {
          reject(error);
        }
      });

      this.server.listen(this.port, () => {
        console.log(`[Hydra Gateway] HTTP server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.server = null;
        console.log('[Hydra Gateway] HTTP server stopped');
        resolve();
      });
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Set CORS headers (restrict to localhost only)
    const origin = req.headers.origin || '';
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Only accept POST to /mcp
    if (req.method !== 'POST' || req.url !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    try {
      const body = await this.readBody(req);
      const request = JSON.parse(body) as JsonRpcRequest | JsonRpcRequest[];

      // Handle batch requests
      if (Array.isArray(request)) {
        const responses = await Promise.all(
          request.map(r => this.handleJsonRpcRequest(r))
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responses));
      } else {
        const response = await this.handleJsonRpcRequest(request);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      }
    } catch (error) {
      console.error('[Hydra Gateway] Request error:', error);
      const errorResponse: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: 0,
        error: {
          code: -32700,
          message: 'Parse error',
        },
      };
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(errorResponse));
    }
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  private async handleJsonRpcRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const { id, method, params } = request;

    try {
      let result: unknown;

      switch (method) {
        case 'initialize':
          result = this.handleInitialize();
          break;

        case 'tools/list':
          result = this.handleToolsList();
          break;

        case 'tools/call':
          result = await this.handleToolsCall(params as { name: string; arguments?: Record<string, unknown> });
          break;

        case 'ping':
          result = {};
          break;

        case 'hooks/list':
          result = this.handleHooksList();
          break;

        case 'hooks/add':
          result = this.handleHooksAdd(params as unknown as HooksAddParams);
          break;

        case 'hooks/update':
          result = this.handleHooksUpdate(params as unknown as HooksUpdateParams);
          break;

        case 'hooks/remove':
          result = this.handleHooksRemove(params as unknown as HooksRemoveParams);
          break;

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          };
      }

      return {
        jsonrpc: '2.0',
        id,
        result,
      };
    } catch (error) {
      console.error(`[Hydra Gateway] Error handling ${method}:`, error);
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
      };
    }
  }

  private handleInitialize(): MCPInitializeResult {
    const capabilities: MCPServerCapabilities = {
      tools: {
        listChanged: true,
      },
    };

    return {
      protocolVersion: PROTOCOL_VERSION,
      capabilities,
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
    };
  }

  private handleToolsList(): { tools: MCPTool[] } {
    return {
      tools: this.toolRegistry.getAllTools(),
    };
  }

  private async handleToolsCall(params: { name: string; arguments?: Record<string, unknown> }): Promise<MCPToolCallResult> {
    const { name, arguments: args } = params;

    // Find the tool and its server
    const tool = this.toolRegistry.getTool(name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Tool not found: ${name}` }],
        isError: true,
      };
    }

    const server = this.toolRegistry.getServerForTool(name);
    if (!server) {
      return {
        content: [{ type: 'text', text: `Server not available for tool: ${name}` }],
        isError: true,
      };
    }

    if (!server.isReady()) {
      return {
        content: [{ type: 'text', text: `Server ${tool.serverName} is not ready` }],
        isError: true,
      };
    }

    try {
      // Call the tool on the child server using the original name
      const result = await server.callTool(tool.originalName, args);
      return result as MCPToolCallResult;
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error calling tool ${name}: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private handleHooksList(): HooksListResult {
    return { hooks: claudeSettingsManager.getHooks() };
  }

  private handleHooksAdd(params: HooksAddParams): HooksListResult {
    const { eventName, matcher, hookConfig } = params;
    return { hooks: claudeSettingsManager.addHook(eventName, matcher, hookConfig) };
  }

  private handleHooksUpdate(params: HooksUpdateParams): HooksListResult {
    const { eventName, entryIndex, hookIndex, newMatcher, hookConfig } = params;
    return { hooks: claudeSettingsManager.updateHook(eventName, entryIndex, hookIndex, newMatcher, hookConfig) };
  }

  private handleHooksRemove(params: HooksRemoveParams): HooksListResult {
    const { eventName, entryIndex, hookIndex } = params;
    return { hooks: claudeSettingsManager.removeHook(eventName, entryIndex, hookIndex) };
  }

  getPort(): number {
    return this.port;
  }

  isRunning(): boolean {
    return this.server !== null;
  }
}
