import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { CommandPalette, commandRegistry, shortcutManager } from './command-palette';
import { SplitPanelManager, SplitDirection, PanelNode, PanelGroup, ViewMode } from './split-panel';
import { inputDialog } from './input-dialog';
import { settingsPanel } from './settings-panel';
import { terminalSearch } from './terminal-search';
import { snippetManager } from './snippets';
import { attachmentPanel } from './attachment-panel';
import { orchestratorPanel } from './orchestrator-panel';
import { hydraStatusPanel } from './hydra-status';
import { sidebarManager } from './sidebar-collapse';

interface ProjectSplitState {
  projectId: string | null;
  rootNode: PanelNode | null;
  activeTerminalId: string | null;
  viewMode?: ViewMode;
  savedSingleViewRoot?: PanelNode | null;
}

interface Project {
  id: string;
  name: string;
  path: string;
  terminalIds: string[];
}

interface SerializedProjectSplitState {
  projectId: string | null;
  rootNode: PanelNode | null;
  activeTerminalId: string | null;
  viewMode?: ViewMode;
  savedSingleViewRoot?: PanelNode | null;
}

interface SessionData {
  terminals: { id: string; name: string; cwd: string; projectId: string | null }[];
  projects: Project[];
  activeTerminalId: string | null;
  activeProjectId: string | null;
  projectSplitStates?: SerializedProjectSplitState[];
}

interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  [key: string]: string;
}

interface IdleNotificationSettings {
  enabled: boolean;
  timeoutSeconds: number;
}

interface Settings {
  theme: 'dark' | 'light';
  fontFamily: string;
  fontSize: number;
  terminalTheme: TerminalTheme;
  idleNotification: IdleNotificationSettings;
}

declare global {
  interface Window {
    electronAPI: {
      createTerminal: (name?: string, cwd?: string) => Promise<string>;
      sendInput: (id: string, data: string) => void;
      onOutput: (callback: (id: string, data: string) => void) => void;
      onTerminalClosed: (callback: (id: string) => void) => void;
      resize: (id: string, cols: number, rows: number) => void;
      closeTerminal: (id: string) => void;
      getTerminalList: () => Promise<{ id: string; name: string }[]>;
      renameTerminal: (id: string, name: string) => void;
      addProject: () => Promise<Project | null>;
      removeProject: (id: string) => Promise<boolean>;
      getProjects: () => Promise<Project[]>;
      getActiveProject: () => Promise<Project | null>;
      setActiveProject: (id: string) => Promise<boolean>;
      addTerminalToProject: (projectId: string, terminalId: string) => void;
      removeTerminalFromProject: (projectId: string, terminalId: string) => void;
      loadSession: () => Promise<SessionData | null>;
      saveSession: (data: SessionData) => void;
      getSettings: () => Promise<Settings>;
      updateSettings: (settings: Partial<Settings>) => Promise<Settings>;
      setTheme: (theme: 'dark' | 'light') => Promise<Settings>;
      setFont: (fontFamily: string, fontSize: number) => Promise<Settings>;
      setIdleNotification: (enabled: boolean, timeoutSeconds?: number) => Promise<Settings>;
      setActiveTerminal: (id: string | null) => void;
      onTerminalFocus: (callback: (id: string) => void) => void;
      onAttentionChange: (callback: (terminalIds: string[]) => void) => void;
      getAttentionList: () => Promise<string[]>;
      updateTerminalProject: (id: string, projectName: string | null) => void;
      // Attachment APIs
      selectImage: () => Promise<{ filePath: string } | null>;
      addAttachment: (filePath: string, title?: string, linkedProjectId?: string) => Promise<any>;
      removeAttachment: (id: string) => Promise<boolean>;
      updateAttachment: (id: string, updates: { title?: string; linkedProjectId?: string }) => Promise<any>;
      getAttachments: () => Promise<any[]>;
      checkFileExists: (filePath: string) => Promise<boolean>;
      readImageAsBase64: (filePath: string) => Promise<string | null>;
      getPathForFile: (file: File) => string;
      // MCP Server APIs
      mcpGetServers: () => Promise<any[]>;
      mcpAddServer: (server: any) => Promise<any>;
      mcpUpdateServer: (id: string, updates: any) => Promise<any>;
      mcpRemoveServer: (id: string) => Promise<boolean>;
      mcpToggleServer: (id: string) => Promise<any>;
      mcpGetTemplates: () => Promise<any>;
      mcpImportSchemaFromUrl: (url: string) => Promise<any>;
      mcpImportSchemaFromFile: () => Promise<any | null>;
      mcpAddServerFromSchema: (schema: any, settings: Record<string, any>) => Promise<any>;
      // Orchestrator APIs
      orchestratorGetAgents: () => Promise<any[]>;
      orchestratorGetWorkflows: () => Promise<any[]>;
      orchestratorGetWorkflow: (id: string) => Promise<any | null>;
      orchestratorCreateWorkflow: (task: string, includeDesignReview: boolean) => Promise<any>;
      orchestratorRunStep: (workflowId: string) => Promise<any | null>;
      orchestratorRunAllSteps: (workflowId: string) => Promise<any | null>;
      orchestratorApproveWorkflow: (workflowId: string) => Promise<any | null>;
      orchestratorRejectWorkflow: (workflowId: string, feedback: string) => Promise<any | null>;
      orchestratorDeleteWorkflow: (workflowId: string) => Promise<boolean>;
      orchestratorResetWorkflow: (workflowId: string) => Promise<any | null>;
      // Hydra Gateway APIs
      hydraStart: () => Promise<any>;
      hydraStop: () => Promise<void>;
      hydraRefresh: () => Promise<any>;
      hydraGetStatus: () => Promise<any>;
      hydraGetTools: () => Promise<Array<{ name: string; serverName: string; description?: string }>>;
      hydraSetPort: (port: number) => Promise<void>;
      onHydraStatusChange: (callback: (status: any) => void) => void;
      onHydraServerStateChange: (callback: (data: { serverId: string; serverName: string; status: string; error?: string }) => void) => void;
    };
  }
}

interface TerminalInstance {
  id: string;
  name: string;
  projectId: string | null;
  terminal: Terminal;
  fitAddon: FitAddon;
  element: HTMLElement;
}

interface MRUEntry {
  terminalId: string;
  lastAccessTime: number;
}

class HydraApp {
  private terminals: Map<string, TerminalInstance> = new Map();
  private projects: Map<string, Project> = new Map();
  private activeTerminalId: string | null = null;
  private activeProjectId: string | null = null;
  private settings: Settings | null = null;
  private projectSplitStates: Map<string | null, ProjectSplitState> = new Map();
  private attentionTerminals: Set<string> = new Set();

  private sidebar: HTMLElement;
  private terminalsContainer: HTMLElement;
  private commandPalette: CommandPalette;
  private splitManager: SplitPanelManager;

  // MRU (Most Recently Used) tab tracking
  private mruList: MRUEntry[] = [];
  private mruSwitcherVisible: boolean = false;
  private mruSwitcherIndex: number = 0;
  private mruSwitcherElement: HTMLElement | null = null;

  // Drag state for panel tabs
  private panelDragState: {
    terminalId: string;
    sourceGroup: PanelGroup;
    startX: number;
    startY: number;
    isDragging: boolean;
    ghostElement: HTMLElement | null;
  } | null = null;

  constructor() {
    this.sidebar = document.getElementById('sidebar')!;
    this.terminalsContainer = document.getElementById('terminals-container')!;
    this.commandPalette = new CommandPalette();

    this.splitManager = new SplitPanelManager(this.terminalsContainer, {
      onTerminalFocus: (id) => this.focusTerminal(id),
      onTerminalClose: (id) => this.closeTerminal(id),
      onTabDragStart: (terminalId, groupNode, e) => this.handlePanelTabDragStart(terminalId, groupNode, e),
      getTerminalElement: (id) => this.terminals.get(id)?.element || null,
      getTerminalName: (id) => this.terminals.get(id)?.name || `Terminal ${id.slice(0, 6)}`,
      hasAttention: (id) => this.attentionTerminals.has(id),
    });

    this.setupPanelDragListeners();
    this.registerCommands();
    this.setupEventListeners();
    this.init();
  }

  private setupPanelDragListeners(): void {
    document.addEventListener('mousemove', (e) => this.handlePanelDragMove(e));
    document.addEventListener('mouseup', (e) => this.handlePanelDragEnd(e));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.panelDragState?.isDragging) {
        this.cancelPanelDrag();
      }
    });
  }

  private handlePanelTabDragStart(terminalId: string, sourceGroup: PanelGroup, e: MouseEvent): void {
    this.panelDragState = {
      terminalId,
      sourceGroup,
      startX: e.clientX,
      startY: e.clientY,
      isDragging: false,
      ghostElement: null,
    };
  }

  private handlePanelDragMove(e: MouseEvent): void {
    if (!this.panelDragState) return;

    const dx = Math.abs(e.clientX - this.panelDragState.startX);
    const dy = Math.abs(e.clientY - this.panelDragState.startY);

    // Start drag after 5px threshold
    if (!this.panelDragState.isDragging && (dx > 5 || dy > 5)) {
      this.panelDragState.isDragging = true;
      this.panelDragState.ghostElement = this.createDragGhost(this.panelDragState.terminalId);
      document.body.classList.add('dragging-active');
    }

    if (this.panelDragState.isDragging && this.panelDragState.ghostElement) {
      this.panelDragState.ghostElement.style.left = `${e.clientX + 10}px`;
      this.panelDragState.ghostElement.style.top = `${e.clientY + 10}px`;

      // Show drop zone overlay
      this.updateDropZoneOverlay(e.clientX, e.clientY);
    }
  }

  private handlePanelDragEnd(e: MouseEvent): void {
    if (!this.panelDragState) return;

    if (this.panelDragState.isDragging) {
      // Handle drop
      const dropResult = this.detectDropTarget(e.clientX, e.clientY);

      if (dropResult) {
        const { terminalId, sourceGroup } = this.panelDragState;

        if (dropResult.position === 'center' && dropResult.targetGroup) {
          // Add to existing group as tab
          if (dropResult.targetGroup !== sourceGroup) {
            this.splitManager.moveTerminal(terminalId, dropResult.targetTerminalId, 'center');
          }
        } else if (dropResult.position !== 'center' && dropResult.targetTerminalId) {
          // Create new split
          this.splitManager.moveTerminal(terminalId, dropResult.targetTerminalId, dropResult.position);
        }

        this.focusTerminal(terminalId);
        setTimeout(() => this.fitAllTerminals(), 0);
      }

      // Cleanup
      this.panelDragState.ghostElement?.remove();
      document.body.classList.remove('dragging-active');
      this.hideDropZoneOverlay();
    }

    this.panelDragState = null;
  }

  private cancelPanelDrag(): void {
    if (this.panelDragState) {
      this.panelDragState.ghostElement?.remove();
      document.body.classList.remove('dragging-active');
      this.hideDropZoneOverlay();
      this.panelDragState = null;
    }
  }

  private createDragGhost(terminalId: string): HTMLElement {
    const ghost = document.createElement('div');
    ghost.className = 'tab-drag-ghost';
    const name = this.terminals.get(terminalId)?.name || 'Terminal';
    ghost.innerHTML = `<span class="tab-name">${name}</span>`;
    document.body.appendChild(ghost);
    return ghost;
  }

  private dropZoneOverlay: HTMLElement | null = null;

  private updateDropZoneOverlay(x: number, y: number): void {
    if (!this.dropZoneOverlay) {
      this.dropZoneOverlay = document.createElement('div');
      this.dropZoneOverlay.className = 'drop-zone-overlay';
      document.body.appendChild(this.dropZoneOverlay);
    }

    const dropResult = this.detectDropTarget(x, y);

    if (dropResult && dropResult.rect) {
      const { rect, position } = dropResult;
      let left: number, top: number, width: number, height: number;

      switch (position) {
        case 'left':
          left = rect.left; top = rect.top;
          width = rect.width * 0.5; height = rect.height;
          break;
        case 'right':
          left = rect.left + rect.width * 0.5; top = rect.top;
          width = rect.width * 0.5; height = rect.height;
          break;
        case 'top':
          left = rect.left; top = rect.top;
          width = rect.width; height = rect.height * 0.5;
          break;
        case 'bottom':
          left = rect.left; top = rect.top + rect.height * 0.5;
          width = rect.width; height = rect.height * 0.5;
          break;
        case 'center':
        default:
          left = rect.left; top = rect.top;
          width = rect.width; height = rect.height;
          break;
      }

      this.dropZoneOverlay.style.display = 'block';
      this.dropZoneOverlay.style.left = `${left}px`;
      this.dropZoneOverlay.style.top = `${top}px`;
      this.dropZoneOverlay.style.width = `${width}px`;
      this.dropZoneOverlay.style.height = `${height}px`;
      this.dropZoneOverlay.dataset.position = position;
    } else {
      this.dropZoneOverlay.style.display = 'none';
    }
  }

  private hideDropZoneOverlay(): void {
    if (this.dropZoneOverlay) {
      this.dropZoneOverlay.style.display = 'none';
    }
  }

  private detectDropTarget(x: number, y: number): {
    position: 'left' | 'right' | 'top' | 'bottom' | 'center';
    targetTerminalId: string | null;
    targetGroup: PanelGroup | null;
    rect: DOMRect | null;
  } | null {
    const groups = this.terminalsContainer.querySelectorAll('.panel-group');

    for (const group of Array.from(groups)) {
      const rect = group.getBoundingClientRect();

      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        // Find terminal ID in this group
        const contentArea = group.querySelector('.panel-group-content');
        const activeWrapper = contentArea?.querySelector('.terminal-wrapper[style*="display: block"]');
        const terminalId = activeWrapper?.id?.replace('terminal-', '') || null;
        const panelGroup = terminalId ? this.splitManager.findGroupByTerminalId(terminalId) : null;

        // Skip if dropping on source group with only one tab
        if (this.panelDragState && panelGroup === this.panelDragState.sourceGroup &&
            panelGroup && panelGroup.terminalIds.length === 1) {
          return null;
        }

        const position = this.getDropPosition(x, y, rect);

        return {
          position,
          targetTerminalId: terminalId,
          targetGroup: panelGroup,
          rect,
        };
      }
    }

    return null;
  }

  private getDropPosition(x: number, y: number, rect: DOMRect): 'left' | 'right' | 'top' | 'bottom' | 'center' {
    const relX = (x - rect.left) / rect.width;
    const relY = (y - rect.top) / rect.height;
    const threshold = 0.25;

    const distances = {
      left: relX,
      right: 1 - relX,
      top: relY,
      bottom: 1 - relY,
    };

    let minEdge: 'left' | 'right' | 'top' | 'bottom' | 'center' = 'center';
    let minDistance = threshold;

    for (const [edge, distance] of Object.entries(distances)) {
      if (distance < minDistance) {
        minDistance = distance;
        minEdge = edge as 'left' | 'right' | 'top' | 'bottom';
      }
    }

    return minEdge;
  }

  private async init(): Promise<void> {
    this.settings = await window.electronAPI.getSettings();
    this.applyTheme();

    // Load initial attention list
    const attentionList = await window.electronAPI.getAttentionList();
    this.attentionTerminals = new Set(attentionList);

    const session = await window.electronAPI.loadSession();
    if (session && session.terminals.length > 0) {
      await this.restoreSession(session);
    } else {
      await this.createTerminal();
    }

    window.addEventListener('beforeunload', () => {
      this.saveSession();
    });
  }

  private getTerminalsForProject(projectId: string | null): TerminalInstance[] {
    return Array.from(this.terminals.values()).filter((t) => t.projectId === projectId);
  }

  private getOrCreateProjectSplitState(projectId: string | null): ProjectSplitState {
    let state = this.projectSplitStates.get(projectId);
    if (!state) {
      state = {
        projectId,
        rootNode: null,
        activeTerminalId: null,
      };
      this.projectSplitStates.set(projectId, state);
    }
    return state;
  }

  private saveCurrentProjectSplitState(): void {
    const state = this.getOrCreateProjectSplitState(this.activeProjectId);
    state.rootNode = this.splitManager.getRoot();
    state.activeTerminalId = this.activeTerminalId;
    state.viewMode = this.splitManager.getViewMode();
    state.savedSingleViewRoot = this.splitManager.getSavedSingleViewRoot();
  }

  private switchToProject(projectId: string | null): void {
    if (this.activeProjectId === projectId) return;

    this.saveCurrentProjectSplitState();
    this.activeProjectId = projectId;

    // Hide ALL terminal elements first
    this.terminals.forEach((instance) => {
      instance.element.style.display = 'none';
    });

    const state = this.getOrCreateProjectSplitState(projectId);
    const terminalsForProject = this.getTerminalsForProject(projectId);

    if (state.rootNode) {
      this.splitManager.setRootFromNode(state.rootNode);
      // Restore view mode state
      this.splitManager.restoreViewModeState(
        state.viewMode || 'single',
        state.savedSingleViewRoot || null
      );
      if (state.activeTerminalId && this.terminals.has(state.activeTerminalId)) {
        this.activeTerminalId = state.activeTerminalId;
      } else if (terminalsForProject.length > 0) {
        this.activeTerminalId = terminalsForProject[0].id;
      }
    } else if (terminalsForProject.length > 0) {
      // Build root from all terminals in this project
      const firstTerminal = terminalsForProject[0];
      this.splitManager.setRoot(firstTerminal.id);
      for (let i = 1; i < terminalsForProject.length; i++) {
        const group = this.splitManager.getRoot();
        if (group && group.type === 'group') {
          this.splitManager.addTerminalToGroup(group, terminalsForProject[i].id);
        }
      }
      this.activeTerminalId = firstTerminal.id;
      // Save this new state
      const newState = this.getOrCreateProjectSplitState(projectId);
      newState.rootNode = this.splitManager.getRoot();
      newState.activeTerminalId = this.activeTerminalId;
    } else {
      this.splitManager.clear();
      this.activeTerminalId = null;
    }

    this.renderSidebar();

    if (this.activeTerminalId) {
      const instance = this.terminals.get(this.activeTerminalId);
      if (instance) {
        setTimeout(() => {
          instance.fitAddon.fit();
          window.electronAPI.resize(instance.id, instance.terminal.cols, instance.terminal.rows);
          instance.terminal.focus();
        }, 0);
      }
    }
  }

  private switchToNextProject(): void {
    const projectIds = Array.from(this.projects.keys());
    if (projectIds.length === 0) return;

    const currentIndex = this.activeProjectId ? projectIds.indexOf(this.activeProjectId) : -1;
    const nextIndex = (currentIndex + 1) % projectIds.length;
    this.switchToProject(projectIds[nextIndex]);
  }

  private switchToPreviousProject(): void {
    const projectIds = Array.from(this.projects.keys());
    if (projectIds.length === 0) return;

    const currentIndex = this.activeProjectId ? projectIds.indexOf(this.activeProjectId) : 0;
    const prevIndex = (currentIndex - 1 + projectIds.length) % projectIds.length;
    this.switchToProject(projectIds[prevIndex]);
  }

  private showProjectSelector(): void {
    const projects = Array.from(this.projects.values());
    if (projects.length === 0) return;

    // Register temporary commands for each project
    const tempCommandIds: string[] = [];
    projects.forEach((project) => {
      const cmdId = `project.select.temp.${project.id}`;
      tempCommandIds.push(cmdId);
      commandRegistry.register({
        id: cmdId,
        label: project.name,
        category: 'Go to Project',
        action: () => {
          this.switchToProject(project.id);
          // Cleanup after selection
          tempCommandIds.forEach((id) => commandRegistry.unregister(id));
        },
      });
    });

    // Show command palette with project filter
    this.commandPalette.show('Go to Project');

    // Cleanup temp commands after a delay (in case palette is closed without selection)
    setTimeout(() => {
      tempCommandIds.forEach((id) => {
        try {
          commandRegistry.unregister(id);
        } catch {
          // Already unregistered
        }
      });
    }, 30000);
  }

  private applyTheme(): void {
    if (!this.settings) return;

    document.documentElement.setAttribute('data-theme', this.settings.theme);

    for (const instance of this.terminals.values()) {
      instance.terminal.options.theme = this.settings.terminalTheme;
      instance.terminal.options.fontFamily = this.settings.fontFamily;
      instance.terminal.options.fontSize = this.settings.fontSize;
    }
  }

  private async setTheme(theme: 'dark' | 'light'): Promise<void> {
    this.settings = await window.electronAPI.setTheme(theme);
    this.applyTheme();
  }

  private async changeFontSize(delta: number): Promise<void> {
    if (!this.settings) return;
    const newSize = Math.max(8, Math.min(32, this.settings.fontSize + delta));
    this.settings = await window.electronAPI.setFont(this.settings.fontFamily, newSize);
    this.applyTheme();
    this.fitAllTerminals();
  }

  private async restoreSession(session: SessionData): Promise<void> {
    for (const project of session.projects) {
      this.projects.set(project.id, project);
    }

    const idMapping = new Map<string, string>();

    for (const terminalData of session.terminals) {
      const newId = await window.electronAPI.createTerminal(terminalData.name, terminalData.cwd);
      idMapping.set(terminalData.id, newId);
      const instance = this.createTerminalInstance(newId, terminalData.name, terminalData.projectId);
      this.terminals.set(newId, instance);
      this.terminalsContainer.appendChild(instance.element);
    }

    const updateNodeIds = (node: any): any => {
      if (!node) return null;
      if (node.type === 'terminal' && node.terminalId) {
        const newId = idMapping.get(node.terminalId);
        if (newId) {
          return { ...node, terminalId: newId };
        }
        return null;
      }
      if (node.type === 'group' && node.terminalIds) {
        const newTerminalIds = node.terminalIds
          .map((id: string) => idMapping.get(id))
          .filter((id: string | undefined) => id);
        if (newTerminalIds.length === 0) return null;
        const newActiveId = idMapping.get(node.activeTerminalId) || newTerminalIds[0];
        return { ...node, terminalIds: newTerminalIds, activeTerminalId: newActiveId };
      }
      if (node.type === 'split' && node.children) {
        const newFirst = updateNodeIds(node.children[0]);
        const newSecond = updateNodeIds(node.children[1]);
        if (newFirst && newSecond) {
          return { ...node, children: [newFirst, newSecond] };
        }
        return newFirst || newSecond;
      }
      return node;
    };

    if (session.projectSplitStates) {
      for (const savedState of session.projectSplitStates) {
        const updatedRootNode = updateNodeIds(savedState.rootNode);
        const updatedActiveId = savedState.activeTerminalId
          ? idMapping.get(savedState.activeTerminalId) || null
          : null;
        const updatedSavedSingleViewRoot = savedState.savedSingleViewRoot
          ? updateNodeIds(savedState.savedSingleViewRoot)
          : null;

        this.projectSplitStates.set(savedState.projectId, {
          projectId: savedState.projectId,
          rootNode: updatedRootNode,
          activeTerminalId: updatedActiveId,
          viewMode: savedState.viewMode,
          savedSingleViewRoot: updatedSavedSingleViewRoot,
        });
      }
    }

    this.activeProjectId = session.activeProjectId;

    const state = this.projectSplitStates.get(this.activeProjectId);
    if (state && state.rootNode) {
      this.splitManager.setRootFromNode(state.rootNode);
      // Restore view mode state
      this.splitManager.restoreViewModeState(
        state.viewMode || 'single',
        state.savedSingleViewRoot || null
      );
      this.activeTerminalId = state.activeTerminalId;
    } else {
      const terminalsForProject = this.getTerminalsForProject(this.activeProjectId);
      if (terminalsForProject.length > 0) {
        this.splitManager.setRoot(terminalsForProject[0].id);
        this.activeTerminalId = terminalsForProject[0].id;
      }
    }

    this.renderSidebar();

    if (this.activeTerminalId) {
      this.focusTerminal(this.activeTerminalId);
    } else {
      const firstTerminalId = Array.from(this.terminals.keys())[0];
      if (firstTerminalId) {
        this.focusTerminal(firstTerminalId);
      }
    }
  }

  private saveSession(): void {
    this.saveCurrentProjectSplitState();

    const terminals = Array.from(this.terminals.values()).map(t => ({
      id: t.id,
      name: t.name,
      cwd: t.projectId ? (this.projects.get(t.projectId)?.path || '') : '',
      projectId: t.projectId,
    }));

    const projects = Array.from(this.projects.values());

    const projectSplitStates = Array.from(this.projectSplitStates.values()).map(state => ({
      projectId: state.projectId,
      rootNode: state.rootNode,
      activeTerminalId: state.activeTerminalId,
      viewMode: state.viewMode,
      savedSingleViewRoot: state.savedSingleViewRoot,
    }));

    const sessionData: SessionData = {
      terminals,
      projects,
      activeTerminalId: this.activeTerminalId,
      activeProjectId: this.activeProjectId,
      projectSplitStates,
    };

    window.electronAPI.saveSession(sessionData);
  }

  private registerCommands(): void {
    // ===== Terminal Commands =====
    commandRegistry.register({
      id: 'terminal.new',
      label: 'New Terminal',
      category: 'Terminal',
      shortcut: '⌘T',
      keybinding: { key: 't', metaKey: true },
      action: () => this.createTerminal(),
    });

    commandRegistry.register({
      id: 'terminal.close',
      label: 'Close Terminal',
      category: 'Terminal',
      shortcut: '⌘W',
      keybinding: { key: 'w', metaKey: true },
      action: () => {
        if (this.activeTerminalId) {
          this.closeTerminal(this.activeTerminalId);
        }
      },
    });

    commandRegistry.register({
      id: 'terminal.next',
      label: 'Next Terminal',
      category: 'Terminal',
      action: () => this.switchToNextTerminal(),
    });

    commandRegistry.register({
      id: 'terminal.previous',
      label: 'Previous Terminal',
      category: 'Terminal',
      action: () => this.switchToPreviousTerminal(),
    });

    commandRegistry.register({
      id: 'terminal.rename',
      label: 'Rename Terminal',
      category: 'Terminal',
      shortcut: '⌘R',
      keybinding: { key: 'r', metaKey: true },
      action: () => this.renameActiveTerminal(),
    });

    commandRegistry.register({
      id: 'terminal.search',
      label: 'Search Terminals',
      category: 'Terminal',
      shortcut: '⌘P',
      keybinding: { key: 'p', metaKey: true },
      action: () => this.showTerminalSearch(),
    });

    // ===== Panel Commands =====
    commandRegistry.register({
      id: 'panel.splitRight',
      label: 'Split Right',
      category: 'Panel',
      shortcut: '⌘\\',
      keybinding: { key: '\\', metaKey: true },
      action: () => this.splitTerminal('vertical'),
    });

    commandRegistry.register({
      id: 'panel.splitDown',
      label: 'Split Down',
      category: 'Panel',
      shortcut: '⌘⇧\\',
      keybinding: { key: '\\', metaKey: true, shiftKey: true },
      action: () => this.splitTerminal('horizontal'),
    });

    commandRegistry.register({
      id: 'panel.focusNext',
      label: 'Focus Next Panel',
      category: 'Panel',
      shortcut: '⌘K ⌘→',
      keybinding: { key: 'k', metaKey: true, sequence: { key: 'ArrowRight', metaKey: true } },
      action: () => this.focusNextGroup(),
    });

    commandRegistry.register({
      id: 'panel.focusPrevious',
      label: 'Focus Previous Panel',
      category: 'Panel',
      shortcut: '⌘K ⌘←',
      keybinding: { key: 'k', metaKey: true, sequence: { key: 'ArrowLeft', metaKey: true } },
      action: () => this.focusPreviousGroup(),
    });

    commandRegistry.register({
      id: 'panel.moveTabNext',
      label: 'Move Tab to Next Panel',
      category: 'Panel',
      shortcut: '⌘K →',
      keybinding: { key: 'k', metaKey: true, sequence: { key: 'ArrowRight' } },
      action: () => this.moveTerminalToNextGroup(),
    });

    commandRegistry.register({
      id: 'panel.moveTabPrevious',
      label: 'Move Tab to Previous Panel',
      category: 'Panel',
      shortcut: '⌘K ←',
      keybinding: { key: 'k', metaKey: true, sequence: { key: 'ArrowLeft' } },
      action: () => this.moveTerminalToPreviousGroup(),
    });

    commandRegistry.register({
      id: 'panel.focusGroup1',
      label: 'Focus Panel 1',
      category: 'Panel',
      shortcut: '⌘1',
      keybinding: { key: '1', metaKey: true },
      action: () => this.focusGroupByIndex(0),
    });

    commandRegistry.register({
      id: 'panel.focusGroup2',
      label: 'Focus Panel 2',
      category: 'Panel',
      shortcut: '⌘2',
      keybinding: { key: '2', metaKey: true },
      action: () => this.focusGroupByIndex(1),
    });

    commandRegistry.register({
      id: 'panel.focusGroup3',
      label: 'Focus Panel 3',
      category: 'Panel',
      shortcut: '⌘3',
      keybinding: { key: '3', metaKey: true },
      action: () => this.focusGroupByIndex(2),
    });

    // ===== Navigation Commands =====
    commandRegistry.register({
      id: 'navigation.nextTabInGroup',
      label: 'Next Tab in Panel',
      category: 'Navigation',
      shortcut: '⌘⇧]',
      keybinding: { key: 'BracketRight', metaKey: true, shiftKey: true },
      action: () => this.switchToNextTabInGroup(),
    });

    commandRegistry.register({
      id: 'navigation.previousTabInGroup',
      label: 'Previous Tab in Panel',
      category: 'Navigation',
      shortcut: '⌘⇧[',
      keybinding: { key: 'BracketLeft', metaKey: true, shiftKey: true },
      action: () => this.switchToPreviousTabInGroup(),
    });

    // ===== Project Commands =====
    commandRegistry.register({
      id: 'project.add',
      label: 'Add Project',
      category: 'Project',
      action: () => this.addProject(),
    });

    commandRegistry.register({
      id: 'project.remove',
      label: 'Remove Project',
      category: 'Project',
      action: () => {
        if (this.activeProjectId) {
          this.removeProject(this.activeProjectId);
        }
      },
    });

    commandRegistry.register({
      id: 'project.newTerminal',
      label: 'New Terminal in Project',
      category: 'Project',
      action: () => this.createTerminalInActiveProject(),
    });

    commandRegistry.register({
      id: 'project.next',
      label: 'Next Project',
      category: 'Project',
      shortcut: '⌘⌥]',
      keybinding: { key: 'BracketRight', metaKey: true, altKey: true },
      action: () => this.switchToNextProject(),
    });

    commandRegistry.register({
      id: 'project.previous',
      label: 'Previous Project',
      category: 'Project',
      shortcut: '⌘⌥[',
      keybinding: { key: 'BracketLeft', metaKey: true, altKey: true },
      action: () => this.switchToPreviousProject(),
    });

    commandRegistry.register({
      id: 'project.select',
      label: 'Go to Project...',
      category: 'Project',
      action: () => this.showProjectSelector(),
    });

    // ===== Settings Commands =====
    commandRegistry.register({
      id: 'settings.themeDark',
      label: 'Dark Theme',
      category: 'Settings',
      action: () => this.setTheme('dark'),
    });

    commandRegistry.register({
      id: 'settings.themeLight',
      label: 'Light Theme',
      category: 'Settings',
      action: () => this.setTheme('light'),
    });

    commandRegistry.register({
      id: 'settings.fontSizeIncrease',
      label: 'Increase Font Size',
      category: 'Settings',
      shortcut: '⌘+',
      keybinding: { key: '=', metaKey: true },
      action: () => this.changeFontSize(1),
    });

    commandRegistry.register({
      id: 'settings.fontSizeDecrease',
      label: 'Decrease Font Size',
      category: 'Settings',
      shortcut: '⌘-',
      keybinding: { key: '-', metaKey: true },
      action: () => this.changeFontSize(-1),
    });

    commandRegistry.register({
      id: 'settings.idleNotificationToggle',
      label: 'Toggle Idle Notification',
      category: 'Settings',
      action: async () => {
        const current = this.settings?.idleNotification?.enabled ?? false;
        this.settings = await window.electronAPI.setIdleNotification(!current);
      },
    });

    commandRegistry.register({
      id: 'settings.idleNotificationTimeout',
      label: 'Set Idle Notification Timeout',
      category: 'Settings',
      action: async () => {
        const current = this.settings?.idleNotification?.timeoutSeconds ?? 3;
        const newTimeout = await inputDialog.show('Enter timeout (seconds):', String(current));
        if (newTimeout) {
          const seconds = parseInt(newTimeout, 10);
          if (!isNaN(seconds) && seconds > 0) {
            this.settings = await window.electronAPI.setIdleNotification(
              this.settings?.idleNotification?.enabled ?? false,
              seconds
            );
          }
        }
      },
    });

    commandRegistry.register({
      id: 'settings.open',
      label: 'Open Settings',
      category: 'Settings',
      shortcut: '⌘,',
      keybinding: { key: ',', metaKey: true },
      action: () => this.openSettings(),
    });

    // ===== View Commands =====
    commandRegistry.register({
      id: 'view.search',
      label: 'Find in Terminal',
      category: 'View',
      shortcut: '⌘F',
      keybinding: { key: 'f', metaKey: true },
      action: () => this.showTerminalSearchBar(),
    });

    commandRegistry.register({
      id: 'view.snippets',
      label: 'Quick Commands',
      category: 'View',
      shortcut: '⌘;',
      keybinding: { key: ';', metaKey: true },
      action: () => this.showSnippets(),
    });

    commandRegistry.register({
      id: 'view.attachments',
      label: 'Image Attachments',
      category: 'View',
      shortcut: '⌘I',
      keybinding: { key: 'i', metaKey: true },
      action: () => this.showAttachments(),
    });

    commandRegistry.register({
      id: 'view.toggleMultiView',
      label: 'Toggle Multi/Single View',
      category: 'View',
      shortcut: '⌘⇧M',
      keybinding: { key: 'm', metaKey: true, shiftKey: true },
      action: () => this.toggleViewMode(),
    });

    commandRegistry.register({
      id: 'view.singleView',
      label: 'Single View (Tabs)',
      category: 'View',
      action: () => this.setViewMode('single'),
    });

    commandRegistry.register({
      id: 'view.multiView',
      label: 'Multi View (Split)',
      category: 'View',
      action: () => this.setViewMode('multi'),
    });

    commandRegistry.register({
      id: 'settings.mcpServers',
      label: 'MCP Server Settings',
      category: 'Settings',
      shortcut: '⌘⇧,',
      keybinding: { key: 'Comma', metaKey: true, shiftKey: true },
      action: () => this.showMCPSettings(),
    });

    commandRegistry.register({
      id: 'view.orchestrator',
      label: 'Agent Orchestrator',
      category: 'View',
      shortcut: '⌘⇧O',
      keybinding: { key: 'o', metaKey: true, shiftKey: true },
      action: () => this.showOrchestrator(),
    });

    commandRegistry.register({
      id: 'view.hydraGateway',
      label: 'Hydra MCP Gateway',
      category: 'View',
      shortcut: '⌘⇧H',
      keybinding: { key: 'h', metaKey: true, shiftKey: true },
      action: () => this.showHydraGateway(),
    });

    commandRegistry.register({
      id: 'view.toggleSidebar',
      label: 'Toggle Sidebar',
      category: 'View',
      shortcut: '⌘B',
      keybinding: { key: 'b', metaKey: true },
      action: () => { sidebarManager.toggle(); },
    });
  }

  private showTerminalSearchBar(): void {
    if (!this.activeTerminalId) return;
    const instance = this.terminals.get(this.activeTerminalId);
    if (!instance) return;

    terminalSearch.show(instance.terminal, () => {
      instance.terminal.focus();
    });
  }

  private showSnippets(): void {
    if (!this.activeTerminalId) return;

    snippetManager.show((command) => {
      const instance = this.terminals.get(this.activeTerminalId!);
      if (instance) {
        window.electronAPI.sendInput(this.activeTerminalId!, command + '\n');
        instance.terminal.focus();
      }
    });
  }

  private showAttachments(): void {
    attachmentPanel.toggle();
  }

  private showMCPSettings(): void {
    if (!this.settings) return;
    settingsPanel.showTab('mcp', this.settings, async (newSettings) => {
      // Apply theme change
      if (newSettings.theme !== this.settings?.theme) {
        this.settings = await window.electronAPI.setTheme(newSettings.theme);
      }
      // Apply font changes
      if (newSettings.fontFamily !== this.settings?.fontFamily ||
          newSettings.fontSize !== this.settings?.fontSize) {
        this.settings = await window.electronAPI.setFont(newSettings.fontFamily, newSettings.fontSize);
      }
      // Apply idle notification changes
      if (newSettings.idleNotification.enabled !== this.settings?.idleNotification?.enabled ||
          newSettings.idleNotification.timeoutSeconds !== this.settings?.idleNotification?.timeoutSeconds) {
        this.settings = await window.electronAPI.setIdleNotification(
          newSettings.idleNotification.enabled,
          newSettings.idleNotification.timeoutSeconds
        );
      }
      this.applyTheme();
      this.fitAllTerminals();
    });
  }

  private showOrchestrator(): void {
    orchestratorPanel.toggle();
  }

  private showHydraGateway(): void {
    hydraStatusPanel.toggle();
  }

  private toggleViewMode(): void {
    this.splitManager.toggleViewMode();
    this.saveCurrentProjectSplitState();
    setTimeout(() => this.fitAllTerminals(), 0);
  }

  private setViewMode(mode: ViewMode): void {
    if (mode === 'single') {
      this.splitManager.switchToSingleView();
    } else {
      this.splitManager.switchToMultiView();
    }
    this.saveCurrentProjectSplitState();
    setTimeout(() => this.fitAllTerminals(), 0);
  }

  private openSettings(): void {
    if (!this.settings) return;

    settingsPanel.show(this.settings, async (newSettings) => {
      // Apply theme change
      if (newSettings.theme !== this.settings?.theme) {
        this.settings = await window.electronAPI.setTheme(newSettings.theme);
      }

      // Apply font changes
      if (newSettings.fontFamily !== this.settings?.fontFamily ||
          newSettings.fontSize !== this.settings?.fontSize) {
        this.settings = await window.electronAPI.setFont(newSettings.fontFamily, newSettings.fontSize);
      }

      // Apply idle notification changes
      if (newSettings.idleNotification.enabled !== this.settings?.idleNotification?.enabled ||
          newSettings.idleNotification.timeoutSeconds !== this.settings?.idleNotification?.timeoutSeconds) {
        this.settings = await window.electronAPI.setIdleNotification(
          newSettings.idleNotification.enabled,
          newSettings.idleNotification.timeoutSeconds
        );
      }

      this.applyTheme();
      this.fitAllTerminals();
    });
  }

  private setupEventListeners(): void {
    window.electronAPI.onOutput((id: string, data: string) => {
      const instance = this.terminals.get(id);
      if (instance) {
        instance.terminal.write(data);
      }
    });

    window.electronAPI.onTerminalClosed((id: string) => {
      this.removeTerminalFromUI(id);
    });

    // Handle terminal focus from notification click
    window.electronAPI.onTerminalFocus((id: string) => {
      this.focusTerminal(id);
    });

    // Handle attention state changes
    window.electronAPI.onAttentionChange((terminalIds: string[]) => {
      this.attentionTerminals = new Set(terminalIds);
      this.renderSidebar();
      this.splitManager.updateTabAttention();
    });

    window.addEventListener('resize', () => {
      this.fitAllTerminals();
    });

    // Register MRU switcher as custom handler (needs special state management)
    shortcutManager.registerCustomHandler('mru-switcher', (e: KeyboardEvent) => {
      // Ctrl+Tab: MRU switcher (next)
      if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        if (!this.mruSwitcherVisible) {
          this.showMRUSwitcher();
        } else {
          this.navigateMRUSwitcher('next');
        }
        return true;
      }

      // Ctrl+Shift+Tab: MRU switcher (previous)
      if (e.ctrlKey && e.shiftKey && e.key === 'Tab') {
        e.preventDefault();
        if (!this.mruSwitcherVisible) {
          this.showMRUSwitcher();
          this.navigateMRUSwitcher('previous');
        } else {
          this.navigateMRUSwitcher('previous');
        }
        return true;
      }

      // Escape: Cancel MRU switcher
      if (e.key === 'Escape' && this.mruSwitcherVisible) {
        e.preventDefault();
        this.hideMRUSwitcher(false);
        return true;
      }

      return false;
    });

    // Ctrl key release: Confirm MRU selection
    document.addEventListener('keyup', (e) => {
      if (e.key === 'Control' && this.mruSwitcherVisible) {
        this.hideMRUSwitcher(true);
      }
    });

    document.getElementById('add-project-btn')?.addEventListener('click', () => {
      this.addProject();
    });

    // Menu event listeners
    (window.electronAPI as any).onMenuOpenSettings?.(() => {
      this.openSettings();
    });

    (window.electronAPI as any).onMenuNewTerminal?.(() => {
      this.createTerminal();
    });

    (window.electronAPI as any).onMenuNewProject?.(() => {
      this.addProject();
    });

    (window.electronAPI as any).onMenuCloseTerminal?.(() => {
      if (this.activeTerminalId) {
        this.closeTerminal(this.activeTerminalId);
      }
    });

    (window.electronAPI as any).onMenuCommandPalette?.(() => {
      this.commandPalette.show();
    });

    (window.electronAPI as any).onMenuSplitRight?.(() => {
      this.splitTerminal('horizontal');
    });

    (window.electronAPI as any).onMenuSplitDown?.(() => {
      this.splitTerminal('vertical');
    });
  }

  // MRU Management
  private updateMRU(terminalId: string): void {
    // Remove existing entry if present
    this.mruList = this.mruList.filter(entry => entry.terminalId !== terminalId);
    // Add to front of list with current timestamp
    this.mruList.unshift({
      terminalId,
      lastAccessTime: Date.now()
    });
  }

  private getMRUList(): string[] {
    // Filter out terminals that no longer exist
    const validEntries = this.mruList.filter(entry => this.terminals.has(entry.terminalId));
    this.mruList = validEntries;
    return validEntries.map(entry => entry.terminalId);
  }

  private cleanupMRU(terminalId: string): void {
    this.mruList = this.mruList.filter(entry => entry.terminalId !== terminalId);
  }

  // MRU Switcher UI
  private showMRUSwitcher(): void {
    const mruIds = this.getMRUList();
    if (mruIds.length <= 1) return;

    this.mruSwitcherVisible = true;
    this.mruSwitcherIndex = 1; // Start at second item (current is first)

    if (!this.mruSwitcherElement) {
      this.mruSwitcherElement = document.createElement('div');
      this.mruSwitcherElement.className = 'mru-switcher-overlay';
      this.mruSwitcherElement.innerHTML = `
        <div class="mru-switcher-container">
          <div class="mru-switcher-title">Switch Terminal</div>
          <div class="mru-switcher-list"></div>
        </div>
      `;
      document.body.appendChild(this.mruSwitcherElement);
    }

    this.renderMRUSwitcherList();
    this.mruSwitcherElement.classList.add('visible');
  }

  private renderMRUSwitcherList(): void {
    if (!this.mruSwitcherElement) return;

    const listEl = this.mruSwitcherElement.querySelector('.mru-switcher-list');
    if (!listEl) return;

    const mruIds = this.getMRUList();
    listEl.innerHTML = '';

    mruIds.forEach((terminalId, index) => {
      const terminal = this.terminals.get(terminalId);
      if (!terminal) return;

      const item = document.createElement('div');
      item.className = 'mru-switcher-item';
      if (index === this.mruSwitcherIndex) {
        item.classList.add('selected');
      }
      item.textContent = terminal.name;
      item.dataset.terminalId = terminalId;
      listEl.appendChild(item);
    });
  }

  private hideMRUSwitcher(selectCurrent: boolean = true): void {
    if (!this.mruSwitcherVisible) return;

    if (selectCurrent) {
      const mruIds = this.getMRUList();
      if (mruIds[this.mruSwitcherIndex]) {
        this.focusTerminal(mruIds[this.mruSwitcherIndex]);
      }
    }

    this.mruSwitcherVisible = false;
    this.mruSwitcherElement?.classList.remove('visible');
  }

  private navigateMRUSwitcher(direction: 'next' | 'previous'): void {
    if (!this.mruSwitcherVisible) return;

    const mruIds = this.getMRUList();
    if (mruIds.length === 0) return;

    if (direction === 'next') {
      this.mruSwitcherIndex = (this.mruSwitcherIndex + 1) % mruIds.length;
    } else {
      this.mruSwitcherIndex = (this.mruSwitcherIndex - 1 + mruIds.length) % mruIds.length;
    }

    this.renderMRUSwitcherList();
  }

  // Group Navigation
  private switchToNextTabInGroup(): void {
    const activeGroup = this.splitManager.getActiveGroup();
    if (!activeGroup) return;

    // In multi-view mode with single tab per group, move to next group
    if (activeGroup.terminalIds.length <= 1) {
      if (this.splitManager.getViewMode() === 'multi') {
        this.focusNextGroup();
        return;
      }
      return;
    }

    const currentIndex = activeGroup.terminalIds.indexOf(activeGroup.activeTerminalId);
    const nextIndex = (currentIndex + 1) % activeGroup.terminalIds.length;
    const nextTerminalId = activeGroup.terminalIds[nextIndex];
    this.focusTerminal(nextTerminalId);
  }

  private switchToPreviousTabInGroup(): void {
    const activeGroup = this.splitManager.getActiveGroup();
    if (!activeGroup) return;

    // In multi-view mode with single tab per group, move to previous group
    if (activeGroup.terminalIds.length <= 1) {
      if (this.splitManager.getViewMode() === 'multi') {
        this.focusPreviousGroup();
        return;
      }
      return;
    }

    const currentIndex = activeGroup.terminalIds.indexOf(activeGroup.activeTerminalId);
    const prevIndex = (currentIndex - 1 + activeGroup.terminalIds.length) % activeGroup.terminalIds.length;
    const prevTerminalId = activeGroup.terminalIds[prevIndex];
    this.focusTerminal(prevTerminalId);
  }

  private focusNextGroup(): void {
    const activeGroup = this.splitManager.getActiveGroup();
    if (!activeGroup) return;

    const nextGroup = this.splitManager.getNextGroup(activeGroup);
    if (nextGroup && nextGroup.activeTerminalId) {
      this.focusTerminal(nextGroup.activeTerminalId);
    }
  }

  private focusPreviousGroup(): void {
    const activeGroup = this.splitManager.getActiveGroup();
    if (!activeGroup) return;

    const prevGroup = this.splitManager.getPreviousGroup(activeGroup);
    if (prevGroup && prevGroup.activeTerminalId) {
      this.focusTerminal(prevGroup.activeTerminalId);
    }
  }

  private focusGroupByIndex(index: number): void {
    const group = this.splitManager.getGroupByIndex(index);
    if (group && group.activeTerminalId) {
      this.focusTerminal(group.activeTerminalId);
    }
  }

  private moveTerminalToNextGroup(): void {
    if (!this.activeTerminalId) return;
    const activeGroup = this.splitManager.getActiveGroup();
    if (!activeGroup) return;

    const nextGroup = this.splitManager.getNextGroup(activeGroup);
    if (nextGroup && nextGroup !== activeGroup) {
      this.splitManager.moveTerminal(this.activeTerminalId, nextGroup.activeTerminalId, 'center');
      this.focusTerminal(this.activeTerminalId);
      setTimeout(() => this.fitAllTerminals(), 0);
    }
  }

  private moveTerminalToPreviousGroup(): void {
    if (!this.activeTerminalId) return;
    const activeGroup = this.splitManager.getActiveGroup();
    if (!activeGroup) return;

    const prevGroup = this.splitManager.getPreviousGroup(activeGroup);
    if (prevGroup && prevGroup !== activeGroup) {
      this.splitManager.moveTerminal(this.activeTerminalId, prevGroup.activeTerminalId, 'center');
      this.focusTerminal(this.activeTerminalId);
      setTimeout(() => this.fitAllTerminals(), 0);
    }
  }

  private fitAllTerminals(): void {
    for (const instance of this.terminals.values()) {
      instance.fitAddon.fit();
      window.electronAPI.resize(instance.id, instance.terminal.cols, instance.terminal.rows);
    }
  }

  private async renameActiveTerminal(): Promise<void> {
    if (!this.activeTerminalId) return;
    const instance = this.terminals.get(this.activeTerminalId);
    if (!instance) return;

    const newName = await inputDialog.show('Enter new terminal name:', instance.name);
    if (newName && newName.trim()) {
      this.renameTerminal(this.activeTerminalId, newName.trim());
    }
  }

  private renameTerminal(id: string, newName: string): void {
    const instance = this.terminals.get(id);
    if (!instance) return;

    instance.name = newName;
    window.electronAPI.renameTerminal(id, newName);

    // Re-render to update tab names in panels
    this.splitManager.render();
    this.renderSidebar();
  }

  private showTerminalSearch(): void {
    const terminals = Array.from(this.terminals.values());
    if (terminals.length === 0) return;

    const tempCommandIds: string[] = [];

    terminals.forEach((t) => {
      const cmdId = `terminal.select.temp.${t.id}`;
      tempCommandIds.push(cmdId);
      commandRegistry.register({
        id: cmdId,
        label: t.name,
        category: 'Go to Terminal',
        action: () => {
          this.focusTerminal(t.id);
        },
      });
    });

    const cleanup = () => {
      tempCommandIds.forEach(id => commandRegistry.unregister(id));
    };

    this.commandPalette.show('Go to Terminal', cleanup);
  }

  private async splitTerminal(direction: SplitDirection): Promise<void> {
    if (!this.activeTerminalId) return;

    const activeInstance = this.terminals.get(this.activeTerminalId);
    if (!activeInstance) return;

    const name = activeInstance.projectId
      ? `${this.projects.get(activeInstance.projectId)?.name} - Terminal`
      : `Terminal ${this.terminals.size + 1}`;
    const cwd = activeInstance.projectId
      ? this.projects.get(activeInstance.projectId)?.path
      : undefined;

    const id = await window.electronAPI.createTerminal(name, cwd);
    const instance = this.createTerminalInstance(id, name, activeInstance.projectId);

    this.terminals.set(id, instance);

    if (activeInstance.projectId) {
      const project = this.projects.get(activeInstance.projectId);
      if (project) {
        project.terminalIds.push(id);
        window.electronAPI.addTerminalToProject(activeInstance.projectId, id);
      }
    }

    this.splitManager.splitTerminal(this.activeTerminalId, direction, id);
    this.renderSidebar();
    this.focusTerminal(id);

    setTimeout(() => this.fitAllTerminals(), 0);
  }

  async addProject(): Promise<void> {
    const project = await window.electronAPI.addProject();
    if (project) {
      this.projects.set(project.id, project);
      this.saveCurrentProjectSplitState();
      this.renderSidebar();
      await this.createTerminalInProject(project.id);
    }
  }

  async removeProject(projectId: string): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) return;

    for (const terminalId of [...project.terminalIds]) {
      this.closeTerminal(terminalId);
    }

    await window.electronAPI.removeProject(projectId);
    this.projects.delete(projectId);
    this.projectSplitStates.delete(projectId);

    if (this.activeProjectId === projectId) {
      const remaining = Array.from(this.projects.keys());
      const newProjectId = remaining.length > 0 ? remaining[0] : null;
      this.switchToProject(newProjectId);
    } else {
      this.renderSidebar();
    }

    // 삭제된 프로젝트 데이터를 세션에서 즉시 제거
    this.saveSession();
  }

  private async createTerminalInActiveProject(): Promise<void> {
    if (this.activeProjectId) {
      await this.createTerminalInProject(this.activeProjectId);
    } else {
      await this.createTerminal();
    }
  }

  private async createTerminalInProject(projectId: string): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) return;

    const name = `${project.name} - Terminal ${project.terminalIds.length + 1}`;
    await this.createTerminal(name, project.path, projectId);
  }

  private createTerminalInstance(id: string, name: string, projectId: string | null): TerminalInstance {
    const terminal = new Terminal({
      theme: this.settings?.terminalTheme || {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
      },
      fontFamily: this.settings?.fontFamily || 'Menlo, Monaco, "Courier New", monospace',
      fontSize: this.settings?.fontSize || 14,
      cursorBlink: true,
      cursorStyle: 'block',
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    const element = document.createElement('div');
    element.className = 'terminal-wrapper';
    element.id = `terminal-${id}`;
    element.style.display = 'none';

    terminal.open(element);

    // KeyboardShortcutManager가 window capture phase에서 먼저 처리하므로
    // 안전을 위한 기본 체크만 유지
    terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'p') {
        return false;
      }
      return true;
    });

    terminal.onData((data: string) => {
      window.electronAPI.sendInput(id, data);
    });

    // File drag and drop support
    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      element.classList.add('drag-over');
    });

    element.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      element.classList.remove('drag-over');
    });

    element.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      element.classList.remove('drag-over');

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const paths: string[] = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const filePath = window.electronAPI.getPathForFile(file);
          if (filePath) {
            // Escape spaces in path
            const escapedPath = filePath.includes(' ') ? `"${filePath}"` : filePath;
            paths.push(escapedPath);
          }
        }
        if (paths.length > 0) {
          window.electronAPI.sendInput(id, paths.join(' '));
          terminal.focus();
        }
      }
    });

    return { id, name, projectId, terminal, fitAddon, element };
  }

  async createTerminal(name?: string, cwd?: string, projectId?: string | null): Promise<void> {
    // Use activeProjectId if projectId is not explicitly provided
    const terminalProjectId = projectId !== undefined ? projectId : this.activeProjectId;

    // If cwd is not specified and there's an active project, use the project's path
    let effectiveCwd = cwd;
    if (!effectiveCwd && this.activeProjectId) {
      const activeProject = this.projects.get(this.activeProjectId);
      if (activeProject?.path) {
        effectiveCwd = activeProject.path;
      }
    }

    const id = await window.electronAPI.createTerminal(name, effectiveCwd);
    const instance = this.createTerminalInstance(
      id,
      name || `Terminal ${this.terminals.size + 1}`,
      terminalProjectId
    );

    this.terminals.set(id, instance);

    if (terminalProjectId) {
      const project = this.projects.get(terminalProjectId);
      if (project) {
        project.terminalIds.push(id);
        window.electronAPI.addTerminalToProject(terminalProjectId, id);
        // Update project name for notifications
        window.electronAPI.updateTerminalProject(id, project.name);
      }
    }

    this.terminalsContainer.appendChild(instance.element);

    // Handle project switch if needed
    if (terminalProjectId !== this.activeProjectId) {
      // Save current project state
      this.saveCurrentProjectSplitState();
      this.activeProjectId = terminalProjectId;

      // Load the target project's existing state
      const targetState = this.getOrCreateProjectSplitState(terminalProjectId);
      if (targetState.rootNode) {
        this.splitManager.setRootFromNode(targetState.rootNode);
      } else {
        this.splitManager.clear();
      }
    }

    // Add to existing group or create new root for THIS project
    const existingGroup = this.splitManager.getRoot();
    if (existingGroup && existingGroup.type === 'group') {
      this.splitManager.addTerminalToGroup(existingGroup, id);
    } else if (existingGroup && existingGroup.type === 'split') {
      // Find the active group in split and add there
      const activeGroup = this.splitManager.getActiveGroup();
      if (activeGroup) {
        this.splitManager.addTerminalToGroup(activeGroup, id);
      } else {
        this.splitManager.setRoot(id);
      }
    } else {
      this.splitManager.setRoot(id);
    }

    // Save the updated state for this project
    const state = this.getOrCreateProjectSplitState(terminalProjectId);
    state.rootNode = this.splitManager.getRoot();
    state.activeTerminalId = id;

    this.renderSidebar();
    this.focusTerminal(id);
  }

  focusTerminal(id: string): void {
    const instance = this.terminals.get(id);
    if (!instance) return;

    const terminalProjectId = instance.projectId;
    if (terminalProjectId !== this.activeProjectId) {
      this.switchToProject(terminalProjectId);
    }

    this.activeTerminalId = id;

    // Notify main process about active terminal (for idle notification)
    window.electronAPI.setActiveTerminal(id);

    // Update MRU list
    this.updateMRU(id);

    // Focus in split manager
    this.splitManager.focusTerminal(id);

    this.renderSidebar();

    setTimeout(() => {
      instance.fitAddon.fit();
      window.electronAPI.resize(id, instance.terminal.cols, instance.terminal.rows);
      instance.terminal.focus();
    }, 0);
  }

  private switchToNextTerminal(): void {
    const terminalsForProject = this.getTerminalsForProject(this.activeProjectId);
    const ids = terminalsForProject.map((t) => t.id);
    if (ids.length === 0) return;

    const currentIndex = ids.indexOf(this.activeTerminalId || '');
    const nextIndex = (currentIndex + 1) % ids.length;
    if (ids[nextIndex]) {
      this.focusTerminal(ids[nextIndex]);
    }
  }

  private switchToPreviousTerminal(): void {
    const terminalsForProject = this.getTerminalsForProject(this.activeProjectId);
    const ids = terminalsForProject.map((t) => t.id);
    if (ids.length === 0) return;

    const currentIndex = ids.indexOf(this.activeTerminalId || '');
    const prevIndex = currentIndex <= 0 ? ids.length - 1 : currentIndex - 1;
    if (ids[prevIndex]) {
      this.focusTerminal(ids[prevIndex]);
    }
  }

  closeTerminal(id: string): void {
    window.electronAPI.closeTerminal(id);
    this.removeTerminalFromUI(id);
  }

  private removeTerminalFromUI(id: string): void {
    const instance = this.terminals.get(id);
    if (!instance) return;

    const terminalProjectId = instance.projectId;

    // Clean up MRU list
    this.cleanupMRU(id);

    instance.terminal.dispose();

    if (instance.projectId) {
      const project = this.projects.get(instance.projectId);
      if (project) {
        project.terminalIds = project.terminalIds.filter((tid) => tid !== id);
        window.electronAPI.removeTerminalFromProject(instance.projectId, id);
      }
    }

    this.terminals.delete(id);

    const remainingId = this.splitManager.removeTerminal(id);

    const state = this.projectSplitStates.get(terminalProjectId);
    if (state) {
      state.rootNode = this.splitManager.getRoot();
      if (state.activeTerminalId === id) {
        state.activeTerminalId = remainingId;
      }
    }

    if (this.activeTerminalId === id) {
      if (remainingId) {
        this.focusTerminal(remainingId);
      } else {
        const remainingInProject = this.getTerminalsForProject(this.activeProjectId);
        if (remainingInProject.length > 0) {
          this.focusTerminal(remainingInProject[remainingInProject.length - 1].id);
        } else {
          const allTerminals = Array.from(this.terminals.values());
          if (allTerminals.length > 0) {
            this.focusTerminal(allTerminals[allTerminals.length - 1].id);
          } else {
            this.createTerminal();
          }
        }
      }
    }

    this.renderSidebar();
    setTimeout(() => this.fitAllTerminals(), 0);
  }

  private renderSidebar(): void {
    const projectList = this.sidebar.querySelector('.project-list');
    if (!projectList) return;

    projectList.innerHTML = '';

    const noProjectTerminals = Array.from(this.terminals.values()).filter((t) => !t.projectId);
    if (noProjectTerminals.length > 0) {
      const section = this.createProjectSection(null, 'Terminals', noProjectTerminals);
      projectList.appendChild(section);
    }

    for (const project of this.projects.values()) {
      const terminals = Array.from(this.terminals.values()).filter(
        (t) => t.projectId === project.id
      );
      const section = this.createProjectSection(project.id, project.name, terminals);
      projectList.appendChild(section);
    }
  }

  private createProjectSection(
    projectId: string | null,
    name: string,
    terminals: TerminalInstance[]
  ): HTMLElement {
    const section = document.createElement('div');
    section.className = `project-section ${this.activeProjectId === projectId ? 'active' : ''}`;

    // Check if any terminal in this project needs attention
    const hasAttention = terminals.some(t => this.attentionTerminals.has(t.id));
    if (hasAttention) {
      section.classList.add('has-attention');
    }

    const header = document.createElement('div');
    header.className = 'project-header';
    const attentionIcon = hasAttention ? '<span class="attention-indicator">●</span>' : '';
    header.innerHTML = `
      <span class="project-name">${attentionIcon}${name}</span>
      <div class="project-actions">
        ${projectId ? '<button class="project-add-terminal" title="New Terminal">+</button>' : ''}
        ${projectId ? '<button class="project-remove" title="Remove Project">×</button>' : ''}
      </div>
    `;

    header.addEventListener('click', () => {
      this.switchToProject(projectId);
    });

    header.querySelector('.project-add-terminal')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (projectId) {
        this.createTerminalInProject(projectId);
      }
    });

    header.querySelector('.project-remove')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (projectId) {
        this.removeProject(projectId);
      }
    });

    section.appendChild(header);

    const terminalList = document.createElement('div');
    terminalList.className = 'terminal-list';

    for (const terminal of terminals) {
      const item = document.createElement('div');
      item.className = `terminal-item ${this.activeTerminalId === terminal.id ? 'active' : ''}`;
      if (this.attentionTerminals.has(terminal.id)) {
        item.classList.add('needs-attention');
      }

      const nameSpan = document.createElement('span');
      nameSpan.className = 'terminal-name';
      nameSpan.textContent = terminal.name;

      // Add attention indicator
      if (this.attentionTerminals.has(terminal.id)) {
        const indicator = document.createElement('span');
        indicator.className = 'attention-indicator';
        indicator.textContent = '●';
        nameSpan.prepend(indicator);
      }

      const closeBtn = document.createElement('button');
      closeBtn.className = 'terminal-close-btn';
      closeBtn.title = 'Close Terminal';
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeTerminal(terminal.id);
      });

      item.appendChild(nameSpan);
      item.appendChild(closeBtn);
      item.addEventListener('click', () => {
        this.focusTerminal(terminal.id);
      });
      terminalList.appendChild(item);
    }

    section.appendChild(terminalList);
    return section;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new HydraApp();
});
