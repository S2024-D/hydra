export interface KeyBinding {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  // For key sequences like Cmd+K, Cmd+Left
  sequence?: KeyBinding;
}

export interface Command {
  id: string;
  label: string;
  category?: string;
  shortcut?: string;  // Display string (e.g., '⌘T')
  keybinding?: KeyBinding;  // Actual keybinding
  action: () => void | Promise<void>;
}

// Category order for sorting
const CATEGORY_ORDER: string[] = [
  'Terminal',
  'Panel',
  'Navigation',
  'Project',
  'Settings',
  'View',
];

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

  getAllSorted(): Command[] {
    return this.sortByCategory(this.getAll());
  }

  execute(id: string): void {
    const command = this.commands.get(id);
    if (command) {
      command.action();
    }
  }

  search(query: string): Command[] {
    if (!query) {
      return this.getAllSorted();
    }

    const lowerQuery = query.toLowerCase();
    return this.sortByCategory(
      this.getAll().filter((cmd) => {
        const searchText = `${cmd.category || ''} ${cmd.label}`.toLowerCase();
        return this.fuzzyMatch(lowerQuery, searchText);
      })
    );
  }

  getByCategory(): Map<string, Command[]> {
    const grouped = new Map<string, Command[]>();

    for (const cmd of this.getAllSorted()) {
      const category = cmd.category || 'Other';
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(cmd);
    }

    return grouped;
  }

  searchByCategory(query: string): Map<string, Command[]> {
    const commands = this.search(query);
    const grouped = new Map<string, Command[]>();

    for (const cmd of commands) {
      const category = cmd.category || 'Other';
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(cmd);
    }

    return grouped;
  }

  private sortByCategory(commands: Command[]): Command[] {
    return commands.sort((a, b) => {
      const aCategory = a.category || 'Other';
      const bCategory = b.category || 'Other';
      const aIndex = CATEGORY_ORDER.indexOf(aCategory);
      const bIndex = CATEGORY_ORDER.indexOf(bCategory);

      // Unknown categories go to the end
      const aOrder = aIndex === -1 ? CATEGORY_ORDER.length : aIndex;
      const bOrder = bIndex === -1 ? CATEGORY_ORDER.length : bIndex;

      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }

      // Within same category, sort alphabetically by label
      return a.label.localeCompare(b.label);
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

    // Global keyboard handling (captures events before xterm)
    document.addEventListener('keydown', (e) => {
      // Toggle shortcut
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'p') {
        e.preventDefault();
        this.toggle();
        return;
      }

      // Only handle when visible
      if (!this.isVisible) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          this.selectNext();
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          this.selectPrevious();
          break;
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          this.executeSelected();
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          this.hide();
          break;
      }
    }, true); // Use capture phase
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

    let currentCategory = '';
    let itemIndex = 0;

    this.filteredCommands.forEach((cmd) => {
      const category = cmd.category || 'Other';

      // Add category header if new category
      if (category !== currentCategory) {
        currentCategory = category;
        const header = document.createElement('div');
        header.className = 'command-category-header';
        header.textContent = category;
        this.list.appendChild(header);
      }

      const item = document.createElement('div');
      const thisIndex = itemIndex;
      item.className = `command-item ${thisIndex === this.selectedIndex ? 'selected' : ''}`;
      item.innerHTML = `
        <span class="command-label">${cmd.label}</span>
        ${cmd.shortcut ? `<span class="command-shortcut">${cmd.shortcut}</span>` : ''}
      `;

      item.addEventListener('click', () => {
        this.selectedIndex = thisIndex;
        this.executeSelected();
      });

      item.addEventListener('mouseenter', () => {
        this.selectedIndex = thisIndex;
        this.renderList();
      });

      this.list.appendChild(item);
      itemIndex++;
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

// Keyboard shortcut manager for centralized keybinding handling
export class KeyboardShortcutManager {
  private pendingSequence: KeyBinding | null = null;
  private sequenceTimeout: ReturnType<typeof setTimeout> | null = null;
  private customHandlers: Map<string, (e: KeyboardEvent) => boolean> = new Map();

  constructor() {
    this.setupGlobalListener();
  }

  private setupGlobalListener(): void {
    // window 레벨에서 capture phase로 가장 먼저 이벤트를 받음
    window.addEventListener('keydown', (e) => this.handleKeyDown(e), true);
  }

  // Register custom handler for special cases (MRU switcher, etc.)
  // Handler should return true if it handled the event
  registerCustomHandler(id: string, handler: (e: KeyboardEvent) => boolean): void {
    this.customHandlers.set(id, handler);
  }

  unregisterCustomHandler(id: string): void {
    this.customHandlers.delete(id);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Skip if focused on input elements (except for specific shortcuts)
    // xterm의 숨겨진 textarea는 제외 (xterm-helper-textarea 클래스)
    const target = e.target as HTMLElement;
    const isXtermTextarea = target.classList?.contains('xterm-helper-textarea');
    if (!isXtermTextarea && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      // Only allow Escape and command palette shortcut
      if (e.key !== 'Escape' && !((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyP')) {
        return;
      }
    }

    // Let custom handlers try first
    for (const handler of this.customHandlers.values()) {
      if (handler(e)) {
        e.stopImmediatePropagation();
        return;
      }
    }

    // Handle pending key sequence
    if (this.pendingSequence) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const commands = commandRegistry.getAll();

      for (const cmd of commands) {
        if (cmd.keybinding?.sequence && this.matchesBinding(e, cmd.keybinding.sequence)) {
          // Check if the first part matches our pending sequence
          const firstPart: KeyBinding = { ...cmd.keybinding };
          delete firstPart.sequence;
          if (this.bindingsEqual(this.pendingSequence, firstPart)) {
            this.clearSequence();
            cmd.action();
            return;
          }
        }
      }

      this.clearSequence();
      return;
    }

    // Check for sequence starters (commands with sequence that start with this key)
    const commands = commandRegistry.getAll();
    for (const cmd of commands) {
      if (cmd.keybinding?.sequence) {
        const firstPart: KeyBinding = { ...cmd.keybinding };
        delete firstPart.sequence;
        if (this.matchesBinding(e, firstPart)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.startSequence(firstPart);
          return;
        }
      }
    }

    // Check for direct keybindings
    for (const cmd of commands) {
      if (cmd.keybinding && !cmd.keybinding.sequence && this.matchesBinding(e, cmd.keybinding)) {
        e.preventDefault();
        e.stopImmediatePropagation();  // xterm으로 전파 차단
        cmd.action();
        return;
      }
    }
  }

  private matchesBinding(e: KeyboardEvent, binding: KeyBinding): boolean {
    const keyMatches = e.key.toLowerCase() === binding.key.toLowerCase() ||
                       e.code === binding.key;

    return keyMatches &&
           !!e.metaKey === !!binding.metaKey &&
           !!e.ctrlKey === !!binding.ctrlKey &&
           !!e.altKey === !!binding.altKey &&
           !!e.shiftKey === !!binding.shiftKey;
  }

  private bindingsEqual(a: KeyBinding, b: KeyBinding): boolean {
    return a.key.toLowerCase() === b.key.toLowerCase() &&
           !!a.metaKey === !!b.metaKey &&
           !!a.ctrlKey === !!b.ctrlKey &&
           !!a.altKey === !!b.altKey &&
           !!a.shiftKey === !!b.shiftKey;
  }

  private startSequence(binding: KeyBinding): void {
    this.pendingSequence = binding;
    if (this.sequenceTimeout) {
      clearTimeout(this.sequenceTimeout);
    }
    this.sequenceTimeout = setTimeout(() => {
      this.clearSequence();
    }, 1000);
  }

  private clearSequence(): void {
    this.pendingSequence = null;
    if (this.sequenceTimeout) {
      clearTimeout(this.sequenceTimeout);
      this.sequenceTimeout = null;
    }
  }

  // Helper to create keybinding from shortcut string
  static parseShortcut(shortcut: string): KeyBinding {
    const binding: KeyBinding = { key: '' };

    // Parse modifier symbols
    if (shortcut.includes('⌘') || shortcut.includes('Cmd')) {
      binding.metaKey = true;
      shortcut = shortcut.replace(/⌘|Cmd\+?/g, '');
    }
    if (shortcut.includes('⌃') || shortcut.includes('Ctrl')) {
      binding.ctrlKey = true;
      shortcut = shortcut.replace(/⌃|Ctrl\+?/g, '');
    }
    if (shortcut.includes('⌥') || shortcut.includes('Alt') || shortcut.includes('Opt')) {
      binding.altKey = true;
      shortcut = shortcut.replace(/⌥|Alt\+?|Opt\+?/g, '');
    }
    if (shortcut.includes('⇧') || shortcut.includes('Shift')) {
      binding.shiftKey = true;
      shortcut = shortcut.replace(/⇧|Shift\+?/g, '');
    }

    // Remaining is the key
    binding.key = shortcut.trim() || shortcut;

    return binding;
  }
}

export const shortcutManager = new KeyboardShortcutManager();
