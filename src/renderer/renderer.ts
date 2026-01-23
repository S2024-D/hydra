import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { CommandPalette, commandRegistry } from './command-palette';
import { SplitPanelManager, SplitDirection, PanelNode } from './split-panel';
import { inputDialog } from './input-dialog';

interface ProjectSplitState {
  projectId: string | null;
  rootNode: PanelNode | null;
  activeTerminalId: string | null;
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

interface Settings {
  theme: 'dark' | 'light';
  fontFamily: string;
  fontSize: number;
  terminalTheme: TerminalTheme;
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

class HydraApp {
  private terminals: Map<string, TerminalInstance> = new Map();
  private projects: Map<string, Project> = new Map();
  private activeTerminalId: string | null = null;
  private activeProjectId: string | null = null;
  private settings: Settings | null = null;
  private projectSplitStates: Map<string | null, ProjectSplitState> = new Map();

  private sidebar: HTMLElement;
  private tabsContainer: HTMLElement;
  private terminalsContainer: HTMLElement;
  private commandPalette: CommandPalette;
  private splitManager: SplitPanelManager;

  constructor() {
    this.sidebar = document.getElementById('sidebar')!;
    this.tabsContainer = document.getElementById('tabs-container')!;
    this.terminalsContainer = document.getElementById('terminals-container')!;
    this.commandPalette = new CommandPalette();
    this.splitManager = new SplitPanelManager(
      this.terminalsContainer,
      (id) => this.focusTerminal(id),
      (id) => this.terminals.get(id)?.element || null
    );

    this.registerCommands();
    this.setupEventListeners();
    this.init();
  }

  private async init(): Promise<void> {
    // Load settings first
    this.settings = await window.electronAPI.getSettings();
    this.applyTheme();

    // Try to restore session
    const session = await window.electronAPI.loadSession();
    if (session && session.terminals.length > 0) {
      await this.restoreSession(session);
    } else {
      await this.createTerminal();
    }

    // Save session on window close
    window.addEventListener('beforeunload', () => {
      this.saveSession();
    });
  }

  // Helper methods for project-based terminal management
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
  }

  private switchToProject(projectId: string | null): void {
    if (this.activeProjectId === projectId) return;

    // Save current project's split state
    this.saveCurrentProjectSplitState();

    // Update active project
    this.activeProjectId = projectId;

    // Restore new project's split state
    const state = this.getOrCreateProjectSplitState(projectId);
    const terminalsForProject = this.getTerminalsForProject(projectId);

    if (state.rootNode) {
      // Restore saved split layout
      this.splitManager.setRootFromNode(state.rootNode);
      if (state.activeTerminalId && this.terminals.has(state.activeTerminalId)) {
        this.activeTerminalId = state.activeTerminalId;
      } else if (terminalsForProject.length > 0) {
        this.activeTerminalId = terminalsForProject[0].id;
      }
    } else if (terminalsForProject.length > 0) {
      // No saved state, set first terminal as root
      this.splitManager.setRoot(terminalsForProject[0].id);
      this.activeTerminalId = terminalsForProject[0].id;
    } else {
      // No terminals for this project
      this.splitManager.clear();
      this.activeTerminalId = null;
    }

    // Re-render tabs and sidebar
    this.renderTabs();
    this.renderSidebar();

    // Focus the active terminal
    if (this.activeTerminalId) {
      const instance = this.terminals.get(this.activeTerminalId);
      if (instance) {
        // Update tab highlight
        this.tabsContainer.querySelectorAll('.tab').forEach((tab) => {
          tab.classList.toggle('active', tab.getAttribute('data-id') === this.activeTerminalId);
        });

        // Update panel highlighting
        this.terminalsContainer.querySelectorAll('.panel-terminal').forEach((panel) => {
          const wrapper = panel.querySelector('.terminal-wrapper');
          if (wrapper) {
            const terminalId = wrapper.id.replace('terminal-', '');
            panel.classList.toggle('active', terminalId === this.activeTerminalId);
          }
        });

        setTimeout(() => {
          instance.fitAddon.fit();
          window.electronAPI.resize(instance.id, instance.terminal.cols, instance.terminal.rows);
          instance.terminal.focus();
        }, 0);
      }
    }
  }

  private applyTheme(): void {
    if (!this.settings) return;

    const isDark = this.settings.theme === 'dark';
    document.documentElement.setAttribute('data-theme', this.settings.theme);

    // Apply to existing terminals
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
    // Restore projects first
    for (const project of session.projects) {
      this.projects.set(project.id, project);
    }

    // Map old terminal IDs to new IDs
    const idMapping = new Map<string, string>();

    // Restore terminals
    for (const terminalData of session.terminals) {
      const newId = await window.electronAPI.createTerminal(terminalData.name, terminalData.cwd);
      idMapping.set(terminalData.id, newId);
      const instance = this.createTerminalInstance(newId, terminalData.name, terminalData.projectId);
      this.terminals.set(newId, instance);
      this.terminalsContainer.appendChild(instance.element);
    }

    // Helper function to update terminal IDs in PanelNode
    const updateNodeIds = (node: PanelNode | null): PanelNode | null => {
      if (!node) return null;
      if (node.type === 'terminal' && node.terminalId) {
        const newId = idMapping.get(node.terminalId);
        if (newId) {
          return { ...node, terminalId: newId };
        }
        return null; // Terminal no longer exists
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

    // Restore project split states with updated IDs
    if (session.projectSplitStates) {
      for (const savedState of session.projectSplitStates) {
        const updatedRootNode = updateNodeIds(savedState.rootNode);
        const updatedActiveId = savedState.activeTerminalId
          ? idMapping.get(savedState.activeTerminalId) || null
          : null;

        this.projectSplitStates.set(savedState.projectId, {
          projectId: savedState.projectId,
          rootNode: updatedRootNode,
          activeTerminalId: updatedActiveId,
        });
      }
    }

    // Set active project (use saved or default to first project with terminals)
    this.activeProjectId = session.activeProjectId;

    // Restore the current project's split state
    const state = this.projectSplitStates.get(this.activeProjectId);
    if (state && state.rootNode) {
      this.splitManager.setRootFromNode(state.rootNode);
      this.activeTerminalId = state.activeTerminalId;
    } else {
      // No saved state, show first terminal for active project
      const terminalsForProject = this.getTerminalsForProject(this.activeProjectId);
      if (terminalsForProject.length > 0) {
        this.splitManager.setRoot(terminalsForProject[0].id);
        this.activeTerminalId = terminalsForProject[0].id;
      }
    }

    this.renderTabs();
    this.renderSidebar();

    // Focus the active terminal
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
    // Save current project's split state before saving session
    this.saveCurrentProjectSplitState();

    const terminals = Array.from(this.terminals.values()).map(t => ({
      id: t.id,
      name: t.name,
      cwd: t.projectId ? (this.projects.get(t.projectId)?.path || '') : '',
      projectId: t.projectId,
    }));

    const projects = Array.from(this.projects.values());

    // Serialize project split states
    const projectSplitStates = Array.from(this.projectSplitStates.values()).map(state => ({
      projectId: state.projectId,
      rootNode: state.rootNode,
      activeTerminalId: state.activeTerminalId,
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
    commandRegistry.register({
      id: 'terminal.new',
      label: 'New Terminal',
      category: 'Terminal',
      shortcut: '⌘T',
      action: () => this.createTerminal(),
    });

    commandRegistry.register({
      id: 'terminal.close',
      label: 'Close Terminal',
      category: 'Terminal',
      shortcut: '⌘W',
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

    // Note: Cmd+1-9 shortcuts are handled in setupEventListeners
    // Use "Search Terminals" command to select terminals by name

    // Split commands
    commandRegistry.register({
      id: 'terminal.splitVertical',
      label: 'Split Terminal Right',
      category: 'Terminal',
      shortcut: '⌘\\',
      action: () => this.splitTerminal('vertical'),
    });

    commandRegistry.register({
      id: 'terminal.splitHorizontal',
      label: 'Split Terminal Down',
      category: 'Terminal',
      shortcut: '⌘⇧\\',
      action: () => this.splitTerminal('horizontal'),
    });

    // Rename command
    commandRegistry.register({
      id: 'terminal.rename',
      label: 'Rename Terminal',
      category: 'Terminal',
      action: () => this.renameActiveTerminal(),
    });

    // Terminal search/select
    commandRegistry.register({
      id: 'terminal.search',
      label: 'Search Terminals',
      category: 'Terminal',
      action: () => this.showTerminalSearch(),
    });

    // Theme commands
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
      action: () => this.changeFontSize(1),
    });

    commandRegistry.register({
      id: 'settings.fontSizeDecrease',
      label: 'Decrease Font Size',
      category: 'Settings',
      action: () => this.changeFontSize(-1),
    });

    // Project commands
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

    window.addEventListener('resize', () => {
      this.fitAllTerminals();
    });

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'p') {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault();
        this.createTerminal();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault();
        if (this.activeTerminalId) {
          this.closeTerminal(this.activeTerminalId);
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        // Only target terminals in current project
        const terminalsForProject = this.getTerminalsForProject(this.activeProjectId);
        const ids = terminalsForProject.map((t) => t.id);
        if (ids[index]) {
          this.focusTerminal(ids[index]);
        }
      }
      // Split shortcuts
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        if (e.shiftKey) {
          this.splitTerminal('horizontal');
        } else {
          this.splitTerminal('vertical');
        }
      }
    });

    document.getElementById('add-terminal-btn')?.addEventListener('click', () => {
      this.createTerminal();
    });

    document.getElementById('add-project-btn')?.addEventListener('click', () => {
      this.addProject();
    });
  }

  private fitAllTerminals(): void {
    for (const instance of this.terminals.values()) {
      instance.fitAddon.fit();
      window.electronAPI.resize(instance.id, instance.terminal.cols, instance.terminal.rows);
    }
  }

  // Rename terminal
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

    // Update tab
    const tab = this.tabsContainer.querySelector(`[data-id="${id}"] .tab-name`);
    if (tab) {
      tab.textContent = newName;
    }

    this.renderSidebar();
  }

  // Terminal search - shows list of terminals using command palette
  private showTerminalSearch(): void {
    const terminals = Array.from(this.terminals.values());
    if (terminals.length === 0) return;

    const tempCommandIds: string[] = [];

    // Temporarily register terminal selection commands
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

    // Clean up temp commands when palette is hidden
    const cleanup = () => {
      tempCommandIds.forEach(id => commandRegistry.unregister(id));
    };

    this.commandPalette.show('Go to Terminal', cleanup);
  }

  // Split methods
  private async splitTerminal(direction: SplitDirection): Promise<void> {
    if (!this.activeTerminalId) return;

    const activeInstance = this.terminals.get(this.activeTerminalId);
    if (!activeInstance) return;

    // Create new terminal with same project
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
    this.createTab(instance);
    this.renderSidebar();
    this.focusTerminal(id);

    setTimeout(() => this.fitAllTerminals(), 0);
  }

  // Project methods
  async addProject(): Promise<void> {
    const project = await window.electronAPI.addProject();
    if (project) {
      this.projects.set(project.id, project);
      // Save current project state before switching
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

    // Remove project split state
    this.projectSplitStates.delete(projectId);

    if (this.activeProjectId === projectId) {
      const remaining = Array.from(this.projects.keys());
      const newProjectId = remaining.length > 0 ? remaining[0] : null;
      this.switchToProject(newProjectId);
    } else {
      this.renderSidebar();
    }
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

  // Terminal methods
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

    terminal.onData((data: string) => {
      window.electronAPI.sendInput(id, data);
    });

    return { id, name, projectId, terminal, fitAddon, element };
  }

  async createTerminal(name?: string, cwd?: string, projectId?: string | null): Promise<void> {
    const terminalProjectId = projectId !== undefined ? projectId : null;
    const id = await window.electronAPI.createTerminal(name, cwd);
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
      }
    }

    // Add element to container
    this.terminalsContainer.appendChild(instance.element);

    // Handle project switching if needed
    if (terminalProjectId !== this.activeProjectId) {
      // Save current project state before switching
      this.saveCurrentProjectSplitState();
      this.activeProjectId = terminalProjectId;
      this.renderTabs();
    }

    // Set the new terminal as root for this project
    this.splitManager.setRoot(id);

    // Update project split state
    const state = this.getOrCreateProjectSplitState(terminalProjectId);
    state.rootNode = this.splitManager.getRoot();
    state.activeTerminalId = id;

    this.createTab(instance);
    this.renderSidebar();
    this.focusTerminal(id);
  }

  private renderTabs(): void {
    // Remove all existing tabs (except add button)
    this.tabsContainer.querySelectorAll('.tab').forEach((tab) => tab.remove());

    // Get terminals for current project
    const terminalsForProject = this.getTerminalsForProject(this.activeProjectId);

    // Create tabs for each terminal in current project
    for (const instance of terminalsForProject) {
      this.createTab(instance);
    }
  }

  private createTab(instance: TerminalInstance): void {
    // Only create tabs for terminals belonging to the current project
    if (instance.projectId !== this.activeProjectId) return;

    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.dataset.id = instance.id;
    tab.innerHTML = `
      <span class="tab-name">${instance.name}</span>
      <button class="tab-close">×</button>
    `;

    if (this.activeTerminalId === instance.id) {
      tab.classList.add('active');
    }

    tab.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).classList.contains('tab-close')) {
        this.focusTerminal(instance.id);
      }
    });

    // Double-click to rename
    tab.querySelector('.tab-name')?.addEventListener('dblclick', async (e) => {
      e.stopPropagation();
      const currentInstance = this.terminals.get(instance.id);
      if (!currentInstance) return;
      const newName = await inputDialog.show('Enter new terminal name:', currentInstance.name);
      if (newName && newName.trim()) {
        this.renameTerminal(instance.id, newName.trim());
      }
    });

    tab.querySelector('.tab-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTerminal(instance.id);
    });

    const addBtn = document.getElementById('add-terminal-btn');
    this.tabsContainer.insertBefore(tab, addBtn);
  }

  focusTerminal(id: string): void {
    const instance = this.terminals.get(id);
    if (!instance) return;

    // Check if terminal belongs to a different project
    const terminalProjectId = instance.projectId;
    if (terminalProjectId !== this.activeProjectId) {
      // Switch to the terminal's project first
      this.switchToProject(terminalProjectId);
    }

    this.activeTerminalId = id;

    // If terminal is not in current split view, set it as the root
    const idsInSplit = this.splitManager.getAllTerminalIds();
    if (!idsInSplit.includes(id)) {
      this.splitManager.setRoot(id);
    }

    // Update tab highlight
    this.tabsContainer.querySelectorAll('.tab').forEach((tab) => {
      tab.classList.toggle('active', tab.getAttribute('data-id') === id);
    });

    // Update panel highlighting
    this.terminalsContainer.querySelectorAll('.panel-terminal').forEach((panel) => {
      const wrapper = panel.querySelector('.terminal-wrapper');
      if (wrapper) {
        const terminalId = wrapper.id.replace('terminal-', '');
        panel.classList.toggle('active', terminalId === id);
      }
    });

    this.renderSidebar();

    setTimeout(() => {
      instance.fitAddon.fit();
      window.electronAPI.resize(id, instance.terminal.cols, instance.terminal.rows);
      instance.terminal.focus();
    }, 0);
  }

  private switchToNextTerminal(): void {
    // Only cycle through terminals in current project
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
    // Only cycle through terminals in current project
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

    instance.terminal.dispose();

    const tab = this.tabsContainer.querySelector(`[data-id="${id}"]`);
    tab?.remove();

    if (instance.projectId) {
      const project = this.projects.get(instance.projectId);
      if (project) {
        project.terminalIds = project.terminalIds.filter((tid) => tid !== id);
        window.electronAPI.removeTerminalFromProject(instance.projectId, id);
      }
    }

    this.terminals.delete(id);

    // Remove from split manager and get remaining terminal to focus
    const remainingId = this.splitManager.removeTerminal(id);

    // Update project split state
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
        // Check for remaining terminals in current project
        const remainingInProject = this.getTerminalsForProject(this.activeProjectId);
        if (remainingInProject.length > 0) {
          this.focusTerminal(remainingInProject[remainingInProject.length - 1].id);
        } else {
          // No terminals left in current project, try to switch to another project
          const allTerminals = Array.from(this.terminals.values());
          if (allTerminals.length > 0) {
            // Switch to a project that has terminals
            this.focusTerminal(allTerminals[allTerminals.length - 1].id);
          } else {
            // No terminals at all, create a new one
            this.createTerminal();
          }
        }
      }
    }

    this.renderTabs();
    this.renderSidebar();
    setTimeout(() => this.fitAllTerminals(), 0);
  }

  // Sidebar rendering
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

    const header = document.createElement('div');
    header.className = 'project-header';
    header.innerHTML = `
      <span class="project-name">${name}</span>
      ${projectId ? '<button class="project-add-terminal" title="New Terminal">+</button>' : ''}
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

    section.appendChild(header);

    const terminalList = document.createElement('div');
    terminalList.className = 'terminal-list';

    for (const terminal of terminals) {
      const item = document.createElement('div');
      item.className = `terminal-item ${this.activeTerminalId === terminal.id ? 'active' : ''}`;
      item.textContent = terminal.name;
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
