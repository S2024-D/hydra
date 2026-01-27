import { Terminal } from '@xterm/xterm';

interface SearchMatch {
  row: number;
  startCol: number;
  endCol: number;
}

export class TerminalSearch {
  private element: HTMLElement;
  private input!: HTMLInputElement;
  private isVisible = false;
  private terminal: Terminal | null = null;
  private matches: SearchMatch[] = [];
  private currentMatchIndex = -1;
  private onClose: (() => void) | null = null;
  private decorations: any[] = [];

  constructor() {
    this.element = this.createSearchElement();
    document.body.appendChild(this.element);
    this.setupEventListeners();
  }

  private createSearchElement(): HTMLElement {
    const searchBar = document.createElement('div');
    searchBar.className = 'terminal-search-bar';
    searchBar.innerHTML = `
      <div class="terminal-search-container">
        <input type="text" class="terminal-search-input" placeholder="Search...">
        <span class="terminal-search-count"></span>
        <button class="terminal-search-btn terminal-search-prev" title="Previous (Shift+Enter)">&#9650;</button>
        <button class="terminal-search-btn terminal-search-next" title="Next (Enter)">&#9660;</button>
        <button class="terminal-search-btn terminal-search-close" title="Close (Escape)">&times;</button>
      </div>
    `;
    return searchBar;
  }

  private setupEventListeners(): void {
    this.input = this.element.querySelector('.terminal-search-input') as HTMLInputElement;

    this.input.addEventListener('input', () => {
      this.performSearch();
    });

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          this.findPrevious();
        } else {
          this.findNext();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.hide();
      }
    });

    this.element.querySelector('.terminal-search-prev')?.addEventListener('click', () => {
      this.findPrevious();
    });

    this.element.querySelector('.terminal-search-next')?.addEventListener('click', () => {
      this.findNext();
    });

    this.element.querySelector('.terminal-search-close')?.addEventListener('click', () => {
      this.hide();
    });
  }

  private performSearch(): void {
    if (!this.terminal) return;

    const query = this.input.value;
    this.clearHighlights();
    this.matches = [];
    this.currentMatchIndex = -1;

    if (!query) {
      this.updateCount();
      return;
    }

    const buffer = this.terminal.buffer.active;
    const lowerQuery = query.toLowerCase();

    // Search through buffer
    for (let row = 0; row < buffer.length; row++) {
      const line = buffer.getLine(row);
      if (!line) continue;

      let lineText = '';
      for (let col = 0; col < line.length; col++) {
        const cell = line.getCell(col);
        if (cell) {
          lineText += cell.getChars() || ' ';
        }
      }

      const lowerLineText = lineText.toLowerCase();
      let searchPos = 0;

      while (true) {
        const index = lowerLineText.indexOf(lowerQuery, searchPos);
        if (index === -1) break;

        this.matches.push({
          row,
          startCol: index,
          endCol: index + query.length,
        });
        searchPos = index + 1;
      }
    }

    if (this.matches.length > 0) {
      this.currentMatchIndex = 0;
      this.highlightMatches();
      this.scrollToMatch();
    }

    this.updateCount();
  }

  private highlightMatches(): void {
    // Note: xterm.js decoration API requires specific handling
    // For now we use visual feedback through the count display
    // Full highlighting would require @xterm/addon-search
  }

  private clearHighlights(): void {
    this.decorations.forEach(d => d.dispose?.());
    this.decorations = [];
  }

  private scrollToMatch(): void {
    if (!this.terminal || this.currentMatchIndex < 0 || this.currentMatchIndex >= this.matches.length) {
      return;
    }

    const match = this.matches[this.currentMatchIndex];
    const buffer = this.terminal.buffer.active;
    const viewportRow = match.row - buffer.baseY;

    // Scroll to show the match
    if (viewportRow < 0 || viewportRow >= this.terminal.rows) {
      this.terminal.scrollToLine(match.row);
    }

    // Select the match text
    this.terminal.select(match.startCol, match.row, match.endCol - match.startCol);
  }

  private updateCount(): void {
    const countEl = this.element.querySelector('.terminal-search-count') as HTMLElement;
    if (this.matches.length === 0) {
      countEl.textContent = this.input.value ? 'No results' : '';
      countEl.classList.toggle('no-results', this.input.value.length > 0);
    } else {
      countEl.textContent = `${this.currentMatchIndex + 1}/${this.matches.length}`;
      countEl.classList.remove('no-results');
    }
  }

  findNext(): void {
    if (this.matches.length === 0) return;
    this.currentMatchIndex = (this.currentMatchIndex + 1) % this.matches.length;
    this.scrollToMatch();
    this.updateCount();
  }

  findPrevious(): void {
    if (this.matches.length === 0) return;
    this.currentMatchIndex = (this.currentMatchIndex - 1 + this.matches.length) % this.matches.length;
    this.scrollToMatch();
    this.updateCount();
  }

  show(terminal: Terminal, onClose?: () => void): void {
    this.terminal = terminal;
    this.onClose = onClose || null;
    this.isVisible = true;
    this.element.classList.add('visible');
    this.input.value = '';
    this.matches = [];
    this.currentMatchIndex = -1;
    this.updateCount();
    this.input.focus();

    // Select any existing text if available
    const selection = terminal.getSelection();
    if (selection) {
      this.input.value = selection;
      this.performSearch();
    }
  }

  hide(): void {
    this.isVisible = false;
    this.element.classList.remove('visible');
    this.clearHighlights();
    this.terminal?.clearSelection();
    this.terminal?.focus();

    if (this.onClose) {
      this.onClose();
      this.onClose = null;
    }
  }

  toggle(terminal: Terminal, onClose?: () => void): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show(terminal, onClose);
    }
  }

  get visible(): boolean {
    return this.isVisible;
  }
}

export const terminalSearch = new TerminalSearch();
