export type SplitDirection = 'horizontal' | 'vertical';

export interface PanelNode {
  type: 'terminal' | 'split';
  terminalId?: string;
  direction?: SplitDirection;
  children?: [PanelNode, PanelNode];
  ratio?: number; // 0-1, first child's size ratio
}

export class SplitPanelManager {
  private root: PanelNode | null = null;
  private container: HTMLElement;
  private onTerminalFocus: (id: string) => void;
  private getTerminalElement: (id: string) => HTMLElement | null;

  constructor(
    container: HTMLElement,
    onTerminalFocus: (id: string) => void,
    getTerminalElement: (id: string) => HTMLElement | null
  ) {
    this.container = container;
    this.onTerminalFocus = onTerminalFocus;
    this.getTerminalElement = getTerminalElement;
  }

  setRoot(terminalId: string): void {
    this.root = { type: 'terminal', terminalId };
    this.render();
  }

  getRoot(): PanelNode | null {
    return this.root;
  }

  setRootFromNode(node: PanelNode | null): void {
    this.root = node;
    this.render();
  }

  clear(): void {
    this.root = null;
    this.render();
  }

  splitTerminal(terminalId: string, direction: SplitDirection, newTerminalId: string): void {
    if (!this.root) {
      this.root = { type: 'terminal', terminalId: newTerminalId };
      this.render();
      return;
    }

    const replaceNode = (node: PanelNode): PanelNode => {
      if (node.type === 'terminal' && node.terminalId === terminalId) {
        return {
          type: 'split',
          direction,
          ratio: 0.5,
          children: [
            { type: 'terminal', terminalId },
            { type: 'terminal', terminalId: newTerminalId },
          ],
        };
      }

      if (node.type === 'split' && node.children) {
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

  removeTerminal(terminalId: string): string | null {
    if (!this.root) return null;

    if (this.root.type === 'terminal' && this.root.terminalId === terminalId) {
      this.root = null;
      this.render();
      return null;
    }

    let remainingTerminalId: string | null = null;

    const removeNode = (node: PanelNode): PanelNode | null => {
      if (node.type === 'terminal') {
        return node.terminalId === terminalId ? null : node;
      }

      if (node.type === 'split' && node.children) {
        const [first, second] = node.children;

        if (first.type === 'terminal' && first.terminalId === terminalId) {
          remainingTerminalId = this.findFirstTerminal(second);
          return second;
        }

        if (second.type === 'terminal' && second.terminalId === terminalId) {
          remainingTerminalId = this.findFirstTerminal(first);
          return first;
        }

        const newFirst = removeNode(first);
        const newSecond = removeNode(second);

        if (!newFirst) return newSecond;
        if (!newSecond) return newFirst;

        return { ...node, children: [newFirst, newSecond] };
      }

      return node;
    };

    this.root = removeNode(this.root);
    this.render();
    return remainingTerminalId;
  }

  private findFirstTerminal(node: PanelNode): string | null {
    if (node.type === 'terminal') return node.terminalId || null;
    if (node.type === 'split' && node.children) {
      return this.findFirstTerminal(node.children[0]);
    }
    return null;
  }

  getAllTerminalIds(): string[] {
    const ids: string[] = [];
    const collect = (node: PanelNode | null) => {
      if (!node) return;
      if (node.type === 'terminal' && node.terminalId) {
        ids.push(node.terminalId);
      }
      if (node.type === 'split' && node.children) {
        collect(node.children[0]);
        collect(node.children[1]);
      }
    };
    collect(this.root);
    return ids;
  }

  render(): void {
    // Collect all terminal elements
    const terminalElements = new Map<string, HTMLElement>();
    this.container.querySelectorAll('.terminal-wrapper').forEach((el) => {
      const id = el.id.replace('terminal-', '');
      terminalElements.set(id, el as HTMLElement);
      // Temporarily remove from DOM but keep reference
      el.remove();
    });

    // Clear only panel structure (not terminal wrappers)
    this.container.querySelectorAll('.panel-split, .panel-terminal').forEach((el) => el.remove());

    if (!this.root) {
      // Re-attach all terminals hidden
      terminalElements.forEach((el) => {
        el.style.display = 'none';
        this.container.appendChild(el);
      });
      return;
    }

    const panelEl = this.createPanelElement(this.root, terminalElements);
    this.container.appendChild(panelEl);

    // Re-attach unused terminals (hidden) so they're preserved
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
    if (node.type === 'terminal' && node.terminalId) {
      const wrapper = document.createElement('div');
      wrapper.className = 'panel-terminal';

      const terminalEl = terminalElements.get(node.terminalId);
      if (terminalEl) {
        terminalEl.style.display = 'block';
        wrapper.appendChild(terminalEl);
      }

      wrapper.addEventListener('click', () => {
        if (node.terminalId) {
          this.onTerminalFocus(node.terminalId);
        }
      });

      return wrapper;
    }

    if (node.type === 'split' && node.children) {
      const container = document.createElement('div');
      container.className = `panel-split panel-split-${node.direction}`;

      const ratio = node.ratio || 0.5;
      const first = this.createPanelElement(node.children[0], terminalElements);
      const second = this.createPanelElement(node.children[1], terminalElements);

      first.style.flex = `${ratio}`;
      second.style.flex = `${1 - ratio}`;

      // Add resizer
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

  private setupResizer(
    resizer: HTMLElement,
    node: PanelNode,
    first: HTMLElement,
    second: HTMLElement
  ): void {
    let startPos = 0;
    let startRatio = node.ratio || 0.5;

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

      // Trigger resize event for terminals
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
      startPos = node.direction === 'horizontal' ? e.clientY : e.clientX;
      startRatio = node.ratio || 0.5;
      document.body.style.cursor = node.direction === 'horizontal' ? 'row-resize' : 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }
}
