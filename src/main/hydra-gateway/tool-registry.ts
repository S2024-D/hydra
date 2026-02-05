import { MCPTool, NamespacedTool } from './types';
import { ChildServerManager } from './child-server-manager';

export class ToolRegistry {
  private tools = new Map<string, NamespacedTool>();
  private serverManagers = new Map<string, ChildServerManager>();
  private searchCache = new Map<string, { nameLower: string; descriptionLower: string }>();

  clear(): void {
    this.tools.clear();
    this.serverManagers.clear();
    this.searchCache.clear();
  }

  registerServer(manager: ChildServerManager): void {
    const state = manager.getState();
    const serverId = state.config.id;
    const serverName = state.config.name;

    this.serverManagers.set(serverId, manager);

    // Register all tools from this server with namespaced names
    for (const tool of manager.getTools()) {
      const namespacedName = this.createNamespacedName(serverName, tool.name);
      const description = this.formatDescription(serverName, tool.description);
      const namespacedTool: NamespacedTool = {
        ...tool,
        name: namespacedName,
        originalName: tool.name,
        serverId,
        serverName,
        description,
      };
      this.tools.set(namespacedName, namespacedTool);
      // Cache lowercase versions for search
      this.searchCache.set(namespacedName, {
        nameLower: namespacedName.toLowerCase(),
        descriptionLower: description.toLowerCase(),
      });
    }
  }

  unregisterServer(serverId: string): void {
    // Remove all tools from this server
    for (const [name, tool] of this.tools) {
      if (tool.serverId === serverId) {
        this.tools.delete(name);
        this.searchCache.delete(name);
      }
    }
    this.serverManagers.delete(serverId);
  }

  private createNamespacedName(serverName: string, toolName: string): string {
    // Sanitize server name: lowercase, replace spaces with underscores
    const sanitized = serverName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `${sanitized}.${toolName}`;
  }

  private formatDescription(serverName: string, description?: string): string {
    const prefix = `[${serverName}]`;
    return description ? `${prefix} ${description}` : prefix;
  }

  getAllTools(): MCPTool[] {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  getTool(namespacedName: string): NamespacedTool | undefined {
    return this.tools.get(namespacedName);
  }

  getServerForTool(namespacedName: string): ChildServerManager | undefined {
    const tool = this.tools.get(namespacedName);
    if (!tool) return undefined;
    return this.serverManagers.get(tool.serverId);
  }

  getToolCount(): number {
    return this.tools.size;
  }

  getServerCount(): number {
    return this.serverManagers.size;
  }

  // Find tools by partial name (for search functionality)
  searchTools(query: string): NamespacedTool[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.tools.values()).filter(tool => {
      const cached = this.searchCache.get(tool.name);
      if (cached) {
        return cached.nameLower.includes(lowerQuery) || cached.descriptionLower.includes(lowerQuery);
      }
      return tool.name.toLowerCase().includes(lowerQuery) ||
        (tool.description?.toLowerCase().includes(lowerQuery) ?? false);
    });
  }

  // Get all tools for a specific server
  getToolsForServer(serverId: string): NamespacedTool[] {
    return Array.from(this.tools.values()).filter(
      tool => tool.serverId === serverId
    );
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry();
