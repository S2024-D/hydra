export type DropPosition = 'left' | 'right' | 'top' | 'bottom' | 'center';

export interface DragState {
  terminalId: string;
  tabElement: HTMLElement;
  startX: number;
  startY: number;
  isDragging: boolean;
  ghostElement: HTMLElement | null;
}

export interface DropZone {
  position: DropPosition;
  targetTerminalId: string | null;
  rect: DOMRect;
}

export interface DropTarget {
  zone: DropZone | null;
  tabIndex: number | null; // For tab reordering within same tab bar
  targetTabElement: HTMLElement | null;
}

export interface DragDropCallbacks {
  onDrop: (terminalId: string, target: DropTarget) => void;
  onTabReorder: (terminalId: string, newIndex: number) => void;
  getTerminalIds: () => string[];
  getPanelElement: (terminalId: string) => HTMLElement | null;
}
