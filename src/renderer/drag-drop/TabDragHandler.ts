import { DragState } from './types';

export interface TabDragCallbacks {
  onDragStart: (terminalId: string, e: MouseEvent) => void;
  onDragMove: (e: MouseEvent) => void;
  onDragEnd: (e: MouseEvent) => void;
}

export class TabDragHandler {
  private dragState: DragState | null = null;
  private callbacks: TabDragCallbacks;
  private dragThreshold = 5; // pixels before drag starts
  private pendingDrag: { terminalId: string; tabElement: HTMLElement; startX: number; startY: number } | null = null;

  constructor(callbacks: TabDragCallbacks) {
    this.callbacks = callbacks;
    this.setupGlobalListeners();
  }

  private setupGlobalListeners(): void {
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('keydown', this.handleKeyDown);
  }

  registerTab(tabElement: HTMLElement, terminalId: string): void {
    tabElement.addEventListener('mousedown', (e) => this.handleTabMouseDown(e, terminalId, tabElement));
  }

  private handleTabMouseDown = (e: MouseEvent, terminalId: string, tabElement: HTMLElement): void => {
    // Only handle left mouse button
    if (e.button !== 0) return;

    // Don't start drag if clicking close button
    if ((e.target as HTMLElement).classList.contains('tab-close')) return;

    // Store pending drag info
    this.pendingDrag = {
      terminalId,
      tabElement,
      startX: e.clientX,
      startY: e.clientY,
    };
  };

  private handleMouseMove = (e: MouseEvent): void => {
    // Check for pending drag start
    if (this.pendingDrag && !this.dragState) {
      const dx = Math.abs(e.clientX - this.pendingDrag.startX);
      const dy = Math.abs(e.clientY - this.pendingDrag.startY);

      if (dx > this.dragThreshold || dy > this.dragThreshold) {
        this.startDrag(this.pendingDrag.terminalId, this.pendingDrag.tabElement, e);
        this.pendingDrag = null;
      }
      return;
    }

    // Handle ongoing drag
    if (this.dragState?.isDragging) {
      this.updateGhostPosition(e);
      this.callbacks.onDragMove(e);
    }
  };

  private handleMouseUp = (e: MouseEvent): void => {
    this.pendingDrag = null;

    if (this.dragState?.isDragging) {
      this.callbacks.onDragEnd(e);
      this.endDrag();
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.dragState?.isDragging) {
      this.cancelDrag();
    }
  };

  private startDrag(terminalId: string, tabElement: HTMLElement, e: MouseEvent): void {
    const ghost = this.createGhost(tabElement);

    this.dragState = {
      terminalId,
      tabElement,
      startX: e.clientX,
      startY: e.clientY,
      isDragging: true,
      ghostElement: ghost,
    };

    tabElement.classList.add('dragging');
    document.body.classList.add('dragging-active');

    this.updateGhostPosition(e);
    this.callbacks.onDragStart(terminalId, e);
  }

  private createGhost(tabElement: HTMLElement): HTMLElement {
    const ghost = document.createElement('div');
    ghost.className = 'tab-drag-ghost';

    const tabName = tabElement.querySelector('.tab-name')?.textContent || 'Terminal';
    ghost.innerHTML = `<span class="tab-name">${tabName}</span>`;

    document.body.appendChild(ghost);
    return ghost;
  }

  private updateGhostPosition(e: MouseEvent): void {
    if (this.dragState?.ghostElement) {
      this.dragState.ghostElement.style.left = `${e.clientX + 10}px`;
      this.dragState.ghostElement.style.top = `${e.clientY + 10}px`;
    }
  }

  private endDrag(): void {
    if (this.dragState) {
      this.dragState.tabElement.classList.remove('dragging');
      this.dragState.ghostElement?.remove();
      document.body.classList.remove('dragging-active');
      this.dragState = null;
    }
  }

  cancelDrag(): void {
    this.endDrag();
    this.pendingDrag = null;
  }

  getDragState(): DragState | null {
    return this.dragState;
  }

  isDragging(): boolean {
    return this.dragState?.isDragging || false;
  }

  destroy(): void {
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('keydown', this.handleKeyDown);
  }
}
