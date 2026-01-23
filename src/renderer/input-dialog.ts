export class InputDialog {
  private overlay: HTMLElement | null = null;
  private container: HTMLElement | null = null;
  private input: HTMLInputElement | null = null;
  private resolvePromise: ((value: string | null) => void) | null = null;
  private initialized = false;

  private init(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.overlay = document.createElement('div');
    this.overlay.className = 'input-dialog-overlay';
    this.overlay.innerHTML = `
      <div class="input-dialog-container">
        <div class="input-dialog-title"></div>
        <input type="text" class="input-dialog-input" />
        <div class="input-dialog-buttons">
          <button class="input-dialog-cancel">Cancel</button>
          <button class="input-dialog-ok">OK</button>
        </div>
      </div>
    `;

    this.container = this.overlay.querySelector('.input-dialog-container')!;
    this.input = this.overlay.querySelector('.input-dialog-input')!;

    this.overlay.querySelector('.input-dialog-cancel')?.addEventListener('click', () => {
      this.close(null);
    });

    this.overlay.querySelector('.input-dialog-ok')?.addEventListener('click', () => {
      this.close(this.input!.value);
    });

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.close(this.input!.value);
      } else if (e.key === 'Escape') {
        this.close(null);
      }
    });

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close(null);
      }
    });

    document.body.appendChild(this.overlay);
  }

  show(title: string, defaultValue: string = ''): Promise<string | null> {
    this.init();
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.overlay!.querySelector('.input-dialog-title')!.textContent = title;
      this.input!.value = defaultValue;
      this.overlay!.classList.add('visible');
      setTimeout(() => {
        this.input!.focus();
        this.input!.select();
      }, 50);
    });
  }

  private close(value: string | null): void {
    this.overlay?.classList.remove('visible');
    if (this.resolvePromise) {
      this.resolvePromise(value);
      this.resolvePromise = null;
    }
  }
}

export const inputDialog = new InputDialog();
