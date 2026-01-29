// JSON-RPC Types
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

// MCP Protocol Types
export interface MCPInitializeParams {
  protocolVersion: string;
  capabilities: MCPClientCapabilities;
  clientInfo: {
    name: string;
    version: string;
  };
}

export interface MCPClientCapabilities {
  roots?: {
    listChanged?: boolean;
  };
  sampling?: Record<string, unknown>;
}

export interface MCPServerCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
}

export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: MCPServerCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
}

// Tool Types
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPToolsListResult {
  tools: MCPTool[];
}

export interface MCPToolCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface MCPToolCallResult {
  content: MCPContent[];
  isError?: boolean;
}

export interface MCPContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
}

// Child Server Types
export interface ChildServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface ChildServerState {
  config: ChildServerConfig;
  status: 'starting' | 'ready' | 'error' | 'stopped';
  tools: MCPTool[];
  error?: string;
}

// Gateway Types
export interface GatewayStatus {
  running: boolean;
  port: number;
  servers: Array<{
    id: string;
    name: string;
    status: ChildServerState['status'];
    toolCount: number;
    error?: string;
  }>;
  totalTools: number;
}

// Namespaced Tool (for tool registry)
export interface NamespacedTool extends MCPTool {
  originalName: string;
  serverId: string;
  serverName: string;
}

// HTTP Request/Response for Streamable HTTP
export interface StreamableHTTPRequest {
  method: 'POST';
  path: string;
  headers: Record<string, string>;
  body: JsonRpcRequest | JsonRpcRequest[];
}

export interface StreamableHTTPResponse {
  status: number;
  headers: Record<string, string>;
  body: JsonRpcResponse | JsonRpcResponse[];
}
