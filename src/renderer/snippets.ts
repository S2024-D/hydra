export interface Snippet {
  id: string;
  name: string;
  command: string;
  category?: string;
}

class SnippetManager {
  private snippets: Map<string, Snippet> = new Map();
  private element: HTMLElement;
  private isVisible = false;
  private selectedIndex = 0;
  private filteredSnippets: Snippet[] = [];
  private onExecute: ((command: string) => void) | null = null;

  constructor() {
    this.element = this.createPanelElement();
    document.body.appendChild(this.element);
    this.setupEventListeners();
    this.loadSnippets();
  }

  private createPanelElement(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'snippets-panel';
    panel.innerHTML = `
      <div class="snippets-panel-backdrop"></div>
      <div class="snippets-panel-container">
        <div class="snippets-panel-header">
          <input type="text" class="snippets-search-input" placeholder="Search or type command...">
          <button class="snippets-add-btn" title="Add Snippet">+</button>
        </div>
        <div class="snippets-list"></div>
        <div class="snippets-hint">Enter: Run | ⌘E: Edit | ⌘D: Delete | Tab: Add new</div>
      </div>
    `;
    return panel;
  }

  private setupEventListeners(): void {
    const input = this.element.querySelector('.snippets-search-input') as HTMLInputElement;
    const list = this.element.querySelector('.snippets-list') as HTMLElement;

    this.element.querySelector('.snippets-panel-backdrop')?.addEventListener('click', () => {
      this.hide();
    });

    this.element.querySelector('.snippets-add-btn')?.addEventListener('click', () => {
      this.addSnippetFromInput();
    });

    input.addEventListener('input', () => {
      this.filterSnippets(input.value);
    });

    input.addEventListener('keydown', (e) => {
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
          if (e.metaKey || e.ctrlKey) {
            // Cmd+Enter: Add as new snippet
            this.addSnippetFromInput();
          } else {
            this.executeSelected();
          }
          break;
        case 'Tab':
          e.preventDefault();
          this.addSnippetFromInput();
          break;
        case 'e':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            this.editSelected();
          }
          break;
        case 'd':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            this.deleteSelected();
          }
          break;
        case 'Escape':
          e.preventDefault();
          this.hide();
          break;
      }
    });
  }

  private loadSnippets(): void {
    try {
      const saved = localStorage.getItem('hydra-snippets');
      if (saved) {
        const snippets: Snippet[] = JSON.parse(saved);
        snippets.forEach(s => this.snippets.set(s.id, s));
      }
    } catch (e) {
      console.error('Failed to load snippets:', e);
    }
  }

  private saveSnippets(): void {
    try {
      const snippets = Array.from(this.snippets.values());
      localStorage.setItem('hydra-snippets', JSON.stringify(snippets));
    } catch (e) {
      console.error('Failed to save snippets:', e);
    }
  }

  private filterSnippets(query: string): void {
    const lowerQuery = query.toLowerCase();
    if (!query) {
      this.filteredSnippets = Array.from(this.snippets.values());
    } else {
      this.filteredSnippets = Array.from(this.snippets.values()).filter(s => {
        return s.name.toLowerCase().includes(lowerQuery) ||
               s.command.toLowerCase().includes(lowerQuery) ||
               (s.category?.toLowerCase().includes(lowerQuery) ?? false);
      });
    }
    this.selectedIndex = 0;
    this.renderList();
  }

  private renderList(): void {
    const list = this.element.querySelector('.snippets-list') as HTMLElement;
    list.innerHTML = '';

    if (this.filteredSnippets.length === 0) {
      list.innerHTML = `
        <div class="snippets-empty">
          ${this.snippets.size === 0 ? 'No snippets yet. Type a command and press Tab to save.' : 'No matching snippets'}
        </div>
      `;
      return;
    }

    this.filteredSnippets.forEach((snippet, index) => {
      const item = document.createElement('div');
      item.className = `snippets-item ${index === this.selectedIndex ? 'selected' : ''}`;
      item.innerHTML = `
        <div class="snippets-item-header">
          <span class="snippets-item-name">${this.escapeHtml(snippet.name)}</span>
          ${snippet.category ? `<span class="snippets-item-category">${this.escapeHtml(snippet.category)}</span>` : ''}
        </div>
        <div class="snippets-item-command">${this.escapeHtml(snippet.command)}</div>
      `;

      item.addEventListener('click', () => {
        this.selectedIndex = index;
        this.executeSelected();
      });

      item.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.renderList();
      });

      list.appendChild(item);
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private selectNext(): void {
    if (this.selectedIndex < this.filteredSnippets.length - 1) {
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
    const selected = this.element.querySelector('.snippets-item.selected');
    selected?.scrollIntoView({ block: 'nearest' });
  }

  private executeSelected(): void {
    const input = this.element.querySelector('.snippets-search-input') as HTMLInputElement;

    if (this.filteredSnippets.length > 0 && this.selectedIndex >= 0) {
      const snippet = this.filteredSnippets[this.selectedIndex];
      if (snippet && this.onExecute) {
        this.hide();
        this.onExecute(snippet.command);
      }
    } else if (input.value.trim() && this.onExecute) {
      // Execute the input directly if no snippet selected
      const command = input.value.trim();
      this.hide();
      this.onExecute(command);
    }
  }

  private async addSnippetFromInput(): Promise<void> {
    const input = this.element.querySelector('.snippets-search-input') as HTMLInputElement;
    const command = input.value.trim();

    if (!command) return;

    const name = prompt('Snippet name:', command.slice(0, 30));
    if (!name) return;

    const category = prompt('Category (optional):', '');

    const snippet: Snippet = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      name,
      command,
      category: category || undefined,
    };

    this.snippets.set(snippet.id, snippet);
    this.saveSnippets();
    input.value = '';
    this.filterSnippets('');
  }

  private editSelected(): void {
    if (this.filteredSnippets.length === 0 || this.selectedIndex < 0) return;

    const snippet = this.filteredSnippets[this.selectedIndex];
    if (!snippet) return;

    const newName = prompt('Snippet name:', snippet.name);
    if (newName === null) return;

    const newCommand = prompt('Command:', snippet.command);
    if (newCommand === null) return;

    const newCategory = prompt('Category:', snippet.category || '');

    snippet.name = newName || snippet.name;
    snippet.command = newCommand || snippet.command;
    snippet.category = newCategory || undefined;

    this.saveSnippets();
    this.renderList();
  }

  private deleteSelected(): void {
    if (this.filteredSnippets.length === 0 || this.selectedIndex < 0) return;

    const snippet = this.filteredSnippets[this.selectedIndex];
    if (!snippet) return;

    if (confirm(`Delete snippet "${snippet.name}"?`)) {
      this.snippets.delete(snippet.id);
      this.saveSnippets();
      this.filterSnippets((this.element.querySelector('.snippets-search-input') as HTMLInputElement).value);
    }
  }

  show(onExecute: (command: string) => void): void {
    this.onExecute = onExecute;
    this.isVisible = true;
    this.element.classList.add('visible');
    this.filterSnippets('');

    const input = this.element.querySelector('.snippets-search-input') as HTMLInputElement;
    input.value = '';
    input.focus();
  }

  hide(): void {
    this.isVisible = false;
    this.element.classList.remove('visible');
    this.onExecute = null;
  }

  toggle(onExecute: (command: string) => void): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show(onExecute);
    }
  }

  get visible(): boolean {
    return this.isVisible;
  }

  // Add snippet programmatically
  addSnippet(name: string, command: string, category?: string): void {
    const snippet: Snippet = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      name,
      command,
      category,
    };
    this.snippets.set(snippet.id, snippet);
    this.saveSnippets();
  }
}

export const snippetManager = new SnippetManager();
