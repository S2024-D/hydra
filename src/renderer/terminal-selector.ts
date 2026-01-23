export interface TerminalOption {
  id: string;
  name: string;
}

export class TerminalSelector {
  private overlay: HTMLElement | null = null;
  private list: HTMLElement | null = null;
  private resolvePromise: ((value: string | null) => void) | null = null;
  private selectedIndex: number = 0;
  private options: TerminalOption[] = [];
  private initialized = false;

  private init(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.overlay = document.createElement('div');
    this.overlay.className = 'terminal-selector-overlay';
    this.overlay.setAttribute('tabindex', '-1');
    this.overlay.innerHTML = `
      <div class="terminal-selector-container">
        <div class="terminal-selector-title">Select Terminal</div>
        <div class="terminal-selector-list"></div>
      </div>
    `;

    this.list = this.overlay.querySelector('.terminal-selector-list')!;

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close(null);
      }
    });

    // Use document-level keydown when visible
    document.addEventListener('keydown', (e) => {
      if (!this.overlay?.classList.contains('visible')) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        this.close(null);
      } else if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        this.selectNext();
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        this.selectPrev();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (this.options[this.selectedIndex]) {
          this.close(this.options[this.selectedIndex].id);
        }
      }
    });

    document.body.appendChild(this.overlay);
  }

  show(title: string, options: TerminalOption[]): Promise<string | null> {
    this.init();
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.options = options;
      this.selectedIndex = 0;

      this.overlay!.querySelector('.terminal-selector-title')!.textContent = title;
      this.renderList();
      this.overlay!.classList.add('visible');
    });
  }

  private renderList(): void {
    if (!this.list) return;
    this.list.innerHTML = '';
    this.options.forEach((option, index) => {
      const item = document.createElement('div');
      item.className = `terminal-selector-item ${index === this.selectedIndex ? 'selected' : ''}`;
      item.textContent = option.name;
      item.addEventListener('click', () => {
        this.close(option.id);
      });
      item.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.updateSelection();
      });
      this.list!.appendChild(item);
    });
  }

  private updateSelection(): void {
    if (!this.list) return;
    const items = this.list.querySelectorAll('.terminal-selector-item');
    items.forEach((item, index) => {
      item.classList.toggle('selected', index === this.selectedIndex);
    });
  }

  private selectNext(): void {
    this.selectedIndex = (this.selectedIndex + 1) % this.options.length;
    this.updateSelection();
  }

  private selectPrev(): void {
    this.selectedIndex = this.selectedIndex <= 0 ? this.options.length - 1 : this.selectedIndex - 1;
    this.updateSelection();
  }

  private close(value: string | null): void {
    this.overlay?.classList.remove('visible');
    if (this.resolvePromise) {
      this.resolvePromise(value);
      this.resolvePromise = null;
    }
  }
}

export const terminalSelector = new TerminalSelector();
