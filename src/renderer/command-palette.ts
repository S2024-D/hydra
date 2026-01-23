export interface Command {
  id: string;
  label: string;
  category?: string;
  shortcut?: string;
  action: () => void | Promise<void>;
}

class CommandRegistry {
  private commands: Map<string, Command> = new Map();

  register(command: Command): void {
    this.commands.set(command.id, command);
  }

  unregister(id: string): void {
    this.commands.delete(id);
  }

  getAll(): Command[] {
    return Array.from(this.commands.values());
  }

  execute(id: string): void {
    const command = this.commands.get(id);
    if (command) {
      command.action();
    }
  }

  search(query: string): Command[] {
    if (!query) {
      return this.getAll();
    }

    const lowerQuery = query.toLowerCase();
    return this.getAll()
      .filter((cmd) => {
        const searchText = `${cmd.category || ''} ${cmd.label}`.toLowerCase();
        return this.fuzzyMatch(lowerQuery, searchText);
      })
      .sort((a, b) => {
        // Prioritize matches at the start
        const aLabel = a.label.toLowerCase();
        const bLabel = b.label.toLowerCase();
        const aStarts = aLabel.startsWith(lowerQuery);
        const bStarts = bLabel.startsWith(lowerQuery);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return 0;
      });
  }

  private fuzzyMatch(query: string, text: string): boolean {
    let queryIndex = 0;
    for (let i = 0; i < text.length && queryIndex < query.length; i++) {
      if (text[i] === query[queryIndex]) {
        queryIndex++;
      }
    }
    return queryIndex === query.length;
  }
}

export const commandRegistry = new CommandRegistry();

export class CommandPalette {
  private element: HTMLElement;
  private input: HTMLInputElement;
  private list: HTMLElement;
  private isVisible = false;
  private selectedIndex = 0;
  private filteredCommands: Command[] = [];
  private onHideCallback: (() => void) | null = null;

  constructor() {
    this.element = this.createPaletteElement();
    this.input = this.element.querySelector('.command-input') as HTMLInputElement;
    this.list = this.element.querySelector('.command-list') as HTMLElement;

    document.body.appendChild(this.element);
    this.setupEventListeners();
  }

  private createPaletteElement(): HTMLElement {
    const palette = document.createElement('div');
    palette.className = 'command-palette';
    palette.innerHTML = `
      <div class="command-palette-backdrop"></div>
      <div class="command-palette-container">
        <input type="text" class="command-input" placeholder="Type a command...">
        <div class="command-list"></div>
      </div>
    `;
    return palette;
  }

  private setupEventListeners(): void {
    // Close on backdrop click
    this.element.querySelector('.command-palette-backdrop')?.addEventListener('click', () => {
      this.hide();
    });

    // Input handling
    this.input.addEventListener('input', () => {
      this.updateList();
    });

    // Keyboard navigation
    this.input.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          this.selectNext();
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.selectPrevious();
          break;
        case 'Enter':
          e.preventDefault();
          this.executeSelected();
          break;
        case 'Escape':
          e.preventDefault();
          this.hide();
          break;
      }
    });

    // Global shortcut
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'p') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  private updateList(): void {
    const query = this.input.value;
    this.filteredCommands = commandRegistry.search(query);
    this.selectedIndex = 0;
    this.renderList();
  }

  private renderList(): void {
    this.list.innerHTML = '';

    if (this.filteredCommands.length === 0) {
      this.list.innerHTML = '<div class="command-item empty">No commands found</div>';
      return;
    }

    this.filteredCommands.forEach((cmd, index) => {
      const item = document.createElement('div');
      item.className = `command-item ${index === this.selectedIndex ? 'selected' : ''}`;
      item.innerHTML = `
        <span class="command-label">
          ${cmd.category ? `<span class="command-category">${cmd.category}:</span>` : ''}
          ${cmd.label}
        </span>
        ${cmd.shortcut ? `<span class="command-shortcut">${cmd.shortcut}</span>` : ''}
      `;

      item.addEventListener('click', () => {
        this.selectedIndex = index;
        this.executeSelected();
      });

      item.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.renderList();
      });

      this.list.appendChild(item);
    });
  }

  private selectNext(): void {
    if (this.selectedIndex < this.filteredCommands.length - 1) {
      this.selectedIndex++;
      this.renderList();
      this.scrollToSelected();
    }
  }

  private selectPrevious(): void {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
      this.renderList();
      this.scrollToSelected();
    }
  }

  private scrollToSelected(): void {
    const selected = this.list.querySelector('.command-item.selected');
    selected?.scrollIntoView({ block: 'nearest' });
  }

  private executeSelected(): void {
    const command = this.filteredCommands[this.selectedIndex];
    if (command) {
      this.hide();
      command.action();
    }
  }

  show(initialFilter?: string, onHide?: () => void): void {
    this.isVisible = true;
    this.onHideCallback = onHide || null;
    this.element.classList.add('visible');
    this.input.value = initialFilter || '';
    this.updateList();
    this.input.focus();
  }

  hide(): void {
    this.isVisible = false;
    this.element.classList.remove('visible');
    if (this.onHideCallback) {
      this.onHideCallback();
      this.onHideCallback = null;
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
