export type SplitDirection = 'horizontal' | 'vertical';

export interface PanelGroup {
  type: 'group';
  terminalIds: string[];
  activeTerminalId: string;
}

export interface PanelSplit {
  type: 'split';
  direction: SplitDirection;
  children: [PanelNode, PanelNode];
  ratio: number; // 0-1, first child's size ratio
}

export type PanelNode = PanelGroup | PanelSplit;

// For backward compatibility with session restore
export interface LegacyPanelNode {
  type: 'terminal' | 'split' | 'group';
  terminalId?: string;
  terminalIds?: string[];
  activeTerminalId?: string;
  direction?: SplitDirection;
  children?: [LegacyPanelNode, LegacyPanelNode];
  ratio?: number;
}

export interface SplitPanelCallbacks {
  onTerminalFocus: (id: string) => void;
  onTerminalClose: (id: string) => void;
  onTabDragStart?: (terminalId: string, groupNode: PanelGroup, e: MouseEvent) => void;
  getTerminalElement: (id: string) => HTMLElement | null;
  getTerminalName: (id: string) => string;
}

export class SplitPanelManager {
  private root: PanelNode | null = null;
  private container: HTMLElement;
  private callbacks: SplitPanelCallbacks;
  private activeGroupNode: PanelGroup | null = null;

  constructor(container: HTMLElement, callbacks: SplitPanelCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  // Legacy constructor compatibility
  static createLegacy(
    container: HTMLElement,
    onTerminalFocus: (id: string) => void,
    getTerminalElement: (id: string) => HTMLElement | null
  ): SplitPanelManager {
    return new SplitPanelManager(container, {
      onTerminalFocus,
      onTerminalClose: () => {},
      getTerminalElement,
      getTerminalName: (id) => `Terminal ${id.slice(0, 6)}`,
    });
  }

  setRoot(terminalId: string): void {
    this.root = {
      type: 'group',
      terminalIds: [terminalId],
      activeTerminalId: terminalId
    };
    this.activeGroupNode = this.root;
    this.render();
  }

  getRoot(): PanelNode | null {
    return this.root;
  }

  setRootFromNode(node: PanelNode | LegacyPanelNode | null): void {
    if (node) {
      this.root = this.migrateLegacyNode(node);
    } else {
      this.root = null;
    }
    this.render();
  }

  // Migrate legacy terminal nodes to group nodes
  private migrateLegacyNode(node: PanelNode | LegacyPanelNode): PanelNode {
    if (node.type === 'terminal' && 'terminalId' in node && node.terminalId) {
      return {
        type: 'group',
        terminalIds: [node.terminalId],
        activeTerminalId: node.terminalId,
      };
    }
    if (node.type === 'group') {
      return node as PanelGroup;
    }
    if (node.type === 'split' && 'children' in node && node.children) {
      return {
        type: 'split',
        direction: node.direction || 'vertical',
        ratio: node.ratio || 0.5,
        children: [
          this.migrateLegacyNode(node.children[0]),
          this.migrateLegacyNode(node.children[1]),
        ],
      };
    }
    // Fallback
    return { type: 'group', terminalIds: [], activeTerminalId: '' };
  }

  clear(): void {
    this.root = null;
    this.activeGroupNode = null;
    this.render();
  }

  // Add terminal to a new split (VS Code style: creates new group)
  splitTerminal(terminalId: string, direction: SplitDirection, newTerminalId: string): void {
    if (!this.root) {
      this.root = {
        type: 'group',
        terminalIds: [newTerminalId],
        activeTerminalId: newTerminalId
      };
      this.render();
      return;
    }

    const replaceNode = (node: PanelNode): PanelNode => {
      if (node.type === 'group' && node.terminalIds.includes(terminalId)) {
        // Create new group for the new terminal
        const newGroup: PanelGroup = {
          type: 'group',
          terminalIds: [newTerminalId],
          activeTerminalId: newTerminalId,
        };
        return {
          type: 'split',
          direction,
          ratio: 0.5,
          children: [node, newGroup],
        };
      }

      if (node.type === 'split') {
        return {
          ...node,
          children: [replaceNode(node.children[0]), replaceNode(node.children[1])],
        };
      }

      return node;
    };

    this.root = replaceNode(this.root);
    this.render();
  }

  // Add terminal to existing group (tab)
  addTerminalToGroup(groupNode: PanelGroup, terminalId: string): void {
    if (!groupNode.terminalIds.includes(terminalId)) {
      groupNode.terminalIds.push(terminalId);
      groupNode.activeTerminalId = terminalId;
      this.render();
    }
  }

  // Find group containing terminal
  findGroupByTerminalId(terminalId: string): PanelGroup | null {
    const findInNode = (node: PanelNode | null): PanelGroup | null => {
      if (!node) return null;
      if (node.type === 'group') {
        return node.terminalIds.includes(terminalId) ? node : null;
      }
      if (node.type === 'split') {
        return findInNode(node.children[0]) || findInNode(node.children[1]);
      }
      return null;
    };
    return findInNode(this.root);
  }

  // Remove terminal from its group
  removeTerminal(terminalId: string): string | null {
    if (!this.root) return null;

    let remainingTerminalId: string | null = null;

    const removeFromNode = (node: PanelNode): PanelNode | null => {
      if (node.type === 'group') {
        const idx = node.terminalIds.indexOf(terminalId);
        if (idx === -1) return node;

        node.terminalIds.splice(idx, 1);

        if (node.terminalIds.length === 0) {
          return null; // Group is empty, remove it
        }

        // Update active terminal if needed
        if (node.activeTerminalId === terminalId) {
          node.activeTerminalId = node.terminalIds[Math.min(idx, node.terminalIds.length - 1)];
        }
        remainingTerminalId = node.activeTerminalId;
        return node;
      }

      if (node.type === 'split') {
        const newFirst = removeFromNode(node.children[0]);
        const newSecond = removeFromNode(node.children[1]);

        if (!newFirst && !newSecond) return null;
        if (!newFirst) {
          remainingTerminalId = this.findFirstTerminal(newSecond!);
          return newSecond;
        }
        if (!newSecond) {
          remainingTerminalId = this.findFirstTerminal(newFirst);
          return newFirst;
        }

        return { ...node, children: [newFirst, newSecond] };
      }

      return node;
    };

    this.root = removeFromNode(this.root);
    this.render();
    return remainingTerminalId;
  }

  // Move terminal to a target position (split or tab)
  moveTerminal(
    terminalId: string,
    targetTerminalId: string | null,
    position: 'left' | 'right' | 'top' | 'bottom' | 'center'
  ): void {
    if (terminalId === targetTerminalId) return;

    // Find source and target groups
    const sourceGroup = this.findGroupByTerminalId(terminalId);
    const targetGroup = targetTerminalId ? this.findGroupByTerminalId(targetTerminalId) : null;

    if (!sourceGroup) return;

    // If center, add to target group as a tab
    if (position === 'center' && targetGroup) {
      // Remove from source
      const idx = sourceGroup.terminalIds.indexOf(terminalId);
      if (idx !== -1) {
        sourceGroup.terminalIds.splice(idx, 1);
        if (sourceGroup.activeTerminalId === terminalId && sourceGroup.terminalIds.length > 0) {
          sourceGroup.activeTerminalId = sourceGroup.terminalIds[Math.min(idx, sourceGroup.terminalIds.length - 1)];
        }
      }

      // Add to target group
      if (!targetGroup.terminalIds.includes(terminalId)) {
        targetGroup.terminalIds.push(terminalId);
        targetGroup.activeTerminalId = terminalId;
      }

      // Clean up empty groups
      this.cleanupEmptyGroups();
      this.render();
      return;
    }

    // For edge positions, create a new split
    if (!targetGroup || !targetTerminalId) return;

    // Remove from source
    const idx = sourceGroup.terminalIds.indexOf(terminalId);
    if (idx !== -1) {
      sourceGroup.terminalIds.splice(idx, 1);
      if (sourceGroup.activeTerminalId === terminalId && sourceGroup.terminalIds.length > 0) {
        sourceGroup.activeTerminalId = sourceGroup.terminalIds[0];
      }
    }

    // Create new group for moved terminal
    const newGroup: PanelGroup = {
      type: 'group',
      terminalIds: [terminalId],
      activeTerminalId: terminalId,
    };

    const direction: SplitDirection =
      position === 'left' || position === 'right' ? 'vertical' : 'horizontal';
    const newFirst = position === 'left' || position === 'top';

    // Replace target group with split
    const replaceNode = (node: PanelNode): PanelNode => {
      if (node === targetGroup) {
        return {
          type: 'split',
          direction,
          ratio: 0.5,
          children: newFirst ? [newGroup, node] : [node, newGroup],
        };
      }
      if (node.type === 'split') {
        return {
          ...node,
          children: [replaceNode(node.children[0]), replaceNode(node.children[1])],
        };
      }
      return node;
    };

    if (this.root) {
      this.root = replaceNode(this.root);
    }

    this.cleanupEmptyGroups();
    this.render();
  }

  // Insert terminal at target (from outside split view)
  insertTerminalAtTarget(
    terminalId: string,
    targetTerminalId: string | null,
    position: 'left' | 'right' | 'top' | 'bottom' | 'center'
  ): void {
    if (!this.root) {
      this.root = {
        type: 'group',
        terminalIds: [terminalId],
        activeTerminalId: terminalId,
      };
      this.render();
      return;
    }

    const targetGroup = targetTerminalId ? this.findGroupByTerminalId(targetTerminalId) : null;

    // If center, add to target group as a tab
    if (position === 'center' && targetGroup) {
      if (!targetGroup.terminalIds.includes(terminalId)) {
        targetGroup.terminalIds.push(terminalId);
        targetGroup.activeTerminalId = terminalId;
      }
      this.render();
      return;
    }

    // For edge positions, create a new split
    if (!targetGroup) {
      // No target, add to root
      if (this.root.type === 'group') {
        this.root.terminalIds.push(terminalId);
        this.root.activeTerminalId = terminalId;
      }
      this.render();
      return;
    }

    const newGroup: PanelGroup = {
      type: 'group',
      terminalIds: [terminalId],
      activeTerminalId: terminalId,
    };

    const direction: SplitDirection =
      position === 'left' || position === 'right' ? 'vertical' : 'horizontal';
    const newFirst = position === 'left' || position === 'top';

    const replaceNode = (node: PanelNode): PanelNode => {
      if (node === targetGroup) {
        return {
          type: 'split',
          direction,
          ratio: 0.5,
          children: newFirst ? [newGroup, node] : [node, newGroup],
        };
      }
      if (node.type === 'split') {
        return {
          ...node,
          children: [replaceNode(node.children[0]), replaceNode(node.children[1])],
        };
      }
      return node;
    };

    this.root = replaceNode(this.root);
    this.render();
  }

  private cleanupEmptyGroups(): void {
    const cleanup = (node: PanelNode | null): PanelNode | null => {
      if (!node) return null;
      if (node.type === 'group') {
        return node.terminalIds.length > 0 ? node : null;
      }
      if (node.type === 'split') {
        const first = cleanup(node.children[0]);
        const second = cleanup(node.children[1]);
        if (!first && !second) return null;
        if (!first) return second;
        if (!second) return first;
        return { ...node, children: [first, second] };
      }
      return node;
    };
    this.root = cleanup(this.root);
  }

  private findFirstTerminal(node: PanelNode): string | null {
    if (node.type === 'group') {
      return node.activeTerminalId || node.terminalIds[0] || null;
    }
    if (node.type === 'split') {
      return this.findFirstTerminal(node.children[0]);
    }
    return null;
  }

  hasTerminal(terminalId: string): boolean {
    return this.getAllTerminalIds().includes(terminalId);
  }

  getAllTerminalIds(): string[] {
    const ids: string[] = [];
    const collect = (node: PanelNode | null) => {
      if (!node) return;
      if (node.type === 'group') {
        ids.push(...node.terminalIds);
      }
      if (node.type === 'split') {
        collect(node.children[0]);
        collect(node.children[1]);
      }
    };
    collect(this.root);
    return ids;
  }

  // Get active terminal in a group
  getActiveTerminalInGroup(groupNode: PanelGroup): string | null {
    return groupNode.activeTerminalId || groupNode.terminalIds[0] || null;
  }

  // Set active terminal in a group
  setActiveTerminalInGroup(groupNode: PanelGroup, terminalId: string): void {
    if (groupNode.terminalIds.includes(terminalId)) {
      groupNode.activeTerminalId = terminalId;
      this.render();
    }
  }

  // Focus terminal (finds group and activates it)
  focusTerminal(terminalId: string): void {
    const group = this.findGroupByTerminalId(terminalId);
    if (group) {
      group.activeTerminalId = terminalId;
      this.activeGroupNode = group;
      this.render();
    }
  }

  // Get all groups in order (left-to-right, top-to-bottom)
  getAllGroups(): PanelGroup[] {
    const groups: PanelGroup[] = [];
    const collectGroups = (node: PanelNode | null): void => {
      if (!node) return;
      if (node.type === 'group') {
        groups.push(node);
      } else if (node.type === 'split') {
        collectGroups(node.children[0]);
        collectGroups(node.children[1]);
      }
    };
    collectGroups(this.root);
    return groups;
  }

  // Get the next group in order
  getNextGroup(currentGroup: PanelGroup): PanelGroup | null {
    const groups = this.getAllGroups();
    const currentIndex = groups.indexOf(currentGroup);
    if (currentIndex === -1 || groups.length <= 1) return null;
    return groups[(currentIndex + 1) % groups.length];
  }

  // Get the previous group in order
  getPreviousGroup(currentGroup: PanelGroup): PanelGroup | null {
    const groups = this.getAllGroups();
    const currentIndex = groups.indexOf(currentGroup);
    if (currentIndex === -1 || groups.length <= 1) return null;
    return groups[(currentIndex - 1 + groups.length) % groups.length];
  }

  // Get the active group node
  getActiveGroup(): PanelGroup | null {
    return this.activeGroupNode;
  }

  // Get group by index (0-based)
  getGroupByIndex(index: number): PanelGroup | null {
    const groups = this.getAllGroups();
    return groups[index] || null;
  }

  render(): void {
    // Collect all terminal elements
    const terminalElements = new Map<string, HTMLElement>();
    this.container.querySelectorAll('.terminal-wrapper').forEach((el) => {
      const id = el.id.replace('terminal-', '');
      terminalElements.set(id, el as HTMLElement);
      el.remove();
    });

    // Clear panel structure
    this.container.querySelectorAll('.panel-split, .panel-group').forEach((el) => el.remove());

    if (!this.root) {
      terminalElements.forEach((el) => {
        el.style.display = 'none';
        this.container.appendChild(el);
      });
      return;
    }

    const panelEl = this.createPanelElement(this.root, terminalElements);
    this.container.appendChild(panelEl);

    // Re-attach unused terminals (hidden)
    const usedIds = this.getAllTerminalIds();
    terminalElements.forEach((el, id) => {
      if (!usedIds.includes(id)) {
        el.style.display = 'none';
        this.container.appendChild(el);
      }
    });
  }

  private createPanelElement(
    node: PanelNode,
    terminalElements: Map<string, HTMLElement>
  ): HTMLElement {
    if (node.type === 'group') {
      return this.createGroupElement(node, terminalElements);
    }

    if (node.type === 'split') {
      const container = document.createElement('div');
      container.className = `panel-split panel-split-${node.direction}`;

      const ratio = node.ratio || 0.5;
      const first = this.createPanelElement(node.children[0], terminalElements);
      const second = this.createPanelElement(node.children[1], terminalElements);

      first.style.flex = `${ratio}`;
      second.style.flex = `${1 - ratio}`;

      const resizer = document.createElement('div');
      resizer.className = `panel-resizer panel-resizer-${node.direction}`;
      this.setupResizer(resizer, node, first, second);

      container.appendChild(first);
      container.appendChild(resizer);
      container.appendChild(second);

      return container;
    }

    return document.createElement('div');
  }

  private createGroupElement(
    group: PanelGroup,
    terminalElements: Map<string, HTMLElement>
  ): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'panel-group';
    if (this.activeGroupNode === group) {
      wrapper.classList.add('active');
    }

    // Create tab bar for this group
    const tabBar = document.createElement('div');
    tabBar.className = 'panel-group-tabs';

    for (const terminalId of group.terminalIds) {
      const tab = document.createElement('div');
      tab.className = 'panel-tab';
      tab.dataset.terminalId = terminalId;

      if (terminalId === group.activeTerminalId) {
        tab.classList.add('active');
      }

      const tabName = document.createElement('span');
      tabName.className = 'panel-tab-name';
      tabName.textContent = this.callbacks.getTerminalName(terminalId);

      const closeBtn = document.createElement('button');
      closeBtn.className = 'panel-tab-close';
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onTerminalClose(terminalId);
      });

      tab.appendChild(tabName);
      tab.appendChild(closeBtn);

      // Tab click to switch
      tab.addEventListener('click', (e) => {
        if (!(e.target as HTMLElement).classList.contains('panel-tab-close')) {
          group.activeTerminalId = terminalId;
          this.activeGroupNode = group;
          this.callbacks.onTerminalFocus(terminalId);
          this.render();
        }
      });

      // Drag start
      tab.addEventListener('mousedown', (e) => {
        if ((e.target as HTMLElement).classList.contains('panel-tab-close')) return;
        if (e.button !== 0) return;
        this.callbacks.onTabDragStart?.(terminalId, group, e);
      });

      tabBar.appendChild(tab);
    }

    wrapper.appendChild(tabBar);

    // Terminal content area
    const contentArea = document.createElement('div');
    contentArea.className = 'panel-group-content';

    // Only show active terminal
    const activeTerminalId = group.activeTerminalId || group.terminalIds[0];
    for (const terminalId of group.terminalIds) {
      const terminalEl = terminalElements.get(terminalId);
      if (terminalEl) {
        terminalEl.style.display = terminalId === activeTerminalId ? 'block' : 'none';
        contentArea.appendChild(terminalEl);
      }
    }

    contentArea.addEventListener('click', () => {
      this.activeGroupNode = group;
      if (group.activeTerminalId) {
        this.callbacks.onTerminalFocus(group.activeTerminalId);
      }
    });

    wrapper.appendChild(contentArea);

    return wrapper;
  }

  private setupResizer(
    resizer: HTMLElement,
    node: PanelSplit,
    first: HTMLElement,
    second: HTMLElement
  ): void {
    const onMouseMove = (e: MouseEvent) => {
      const container = resizer.parentElement;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      let newRatio: number;

      if (node.direction === 'horizontal') {
        newRatio = (e.clientY - rect.top) / rect.height;
      } else {
        newRatio = (e.clientX - rect.left) / rect.width;
      }

      newRatio = Math.max(0.1, Math.min(0.9, newRatio));
      node.ratio = newRatio;

      first.style.flex = `${newRatio}`;
      second.style.flex = `${1 - newRatio}`;

      window.dispatchEvent(new Event('resize'));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      document.body.style.cursor = node.direction === 'horizontal' ? 'row-resize' : 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }
}
