import { DragDropCallbacks, DropTarget, DropZone } from './types';
import { TabDragHandler } from './TabDragHandler';
import { DropZoneDetector } from './DropZoneDetector';
import { DropZoneOverlay } from './DropZoneOverlay';

export class DragDropManager {
  private dragHandler: TabDragHandler;
  private dropZoneDetector: DropZoneDetector;
  private overlay: DropZoneOverlay;
  private callbacks: DragDropCallbacks;
  private tabsContainer: HTMLElement;
  private terminalsContainer: HTMLElement;
  private currentDropTarget: DropTarget | null = null;

  constructor(
    tabsContainer: HTMLElement,
    terminalsContainer: HTMLElement,
    callbacks: DragDropCallbacks
  ) {
    this.tabsContainer = tabsContainer;
    this.terminalsContainer = terminalsContainer;
    this.callbacks = callbacks;

    this.dropZoneDetector = new DropZoneDetector(terminalsContainer);
    this.overlay = new DropZoneOverlay();

    this.dragHandler = new TabDragHandler({
      onDragStart: this.handleDragStart,
      onDragMove: this.handleDragMove,
      onDragEnd: this.handleDragEnd,
    });
  }

  registerTab(tabElement: HTMLElement, terminalId: string): void {
    this.dragHandler.registerTab(tabElement, terminalId);
  }

  private handleDragStart = (terminalId: string, e: MouseEvent): void => {
    this.currentDropTarget = null;
  };

  private handleDragMove = (e: MouseEvent): void => {
    const dragState = this.dragHandler.getDragState();
    if (!dragState) return;

    // Check if over tabs container first
    const tabsRect = this.tabsContainer.getBoundingClientRect();
    if (e.clientY >= tabsRect.top && e.clientY <= tabsRect.bottom &&
        e.clientX >= tabsRect.left && e.clientX <= tabsRect.right) {
      // Over tabs - show tab reorder indicator
      const tabPosition = this.dropZoneDetector.detectTabDropPosition(
        e.clientX, e.clientY, this.tabsContainer
      );

      if (tabPosition) {
        this.currentDropTarget = {
          zone: null,
          tabIndex: tabPosition.index,
          targetTabElement: tabPosition.element,
        };

        // Calculate indicator position
        let indicatorX: number;
        if (tabPosition.element) {
          const tabRect = tabPosition.element.getBoundingClientRect();
          const idx = tabPosition.index;
          const tabs = this.tabsContainer.querySelectorAll('.tab');
          const currentTabIdx = Array.from(tabs).indexOf(tabPosition.element);

          if (idx <= currentTabIdx) {
            indicatorX = tabRect.left;
          } else {
            indicatorX = tabRect.right;
          }
        } else {
          // After last tab
          const lastTab = this.tabsContainer.querySelector('.tab:last-of-type');
          if (lastTab) {
            indicatorX = lastTab.getBoundingClientRect().right;
          } else {
            indicatorX = tabsRect.left;
          }
        }

        this.overlay.showTabIndicator(indicatorX, this.tabsContainer);
        return;
      }
    }

    // Check terminal panels
    const dropZone = this.dropZoneDetector.detectDropZone(
      e.clientX, e.clientY, dragState.terminalId
    );

    if (dropZone) {
      this.currentDropTarget = {
        zone: dropZone,
        tabIndex: null,
        targetTabElement: null,
      };
      this.overlay.showDropZone(dropZone);
    } else {
      this.currentDropTarget = null;
      this.overlay.hide();
    }
  };

  private handleDragEnd = (e: MouseEvent): void => {
    const dragState = this.dragHandler.getDragState();
    if (!dragState) return;

    if (this.currentDropTarget) {
      if (this.currentDropTarget.tabIndex !== null) {
        // Tab reorder
        this.callbacks.onTabReorder(dragState.terminalId, this.currentDropTarget.tabIndex);
      } else if (this.currentDropTarget.zone) {
        // Split drop
        this.callbacks.onDrop(dragState.terminalId, this.currentDropTarget);
      }
    }

    this.overlay.hide();
    this.currentDropTarget = null;
  };

  isDragging(): boolean {
    return this.dragHandler.isDragging();
  }

  destroy(): void {
    this.dragHandler.destroy();
    this.overlay.destroy();
  }
}
