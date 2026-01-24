import { DropPosition, DropZone } from './types';

export class DropZoneDetector {
  private container: HTMLElement;
  private edgeThreshold = 0.25; // 25% from edge triggers split zone

  constructor(container: HTMLElement) {
    this.container = container;
  }

  detectDropZone(x: number, y: number, draggedTerminalId: string): DropZone | null {
    // Find all panel-terminal elements
    const panels = Array.from(this.container.querySelectorAll('.panel-terminal'));

    for (const panel of panels) {
      const rect = panel.getBoundingClientRect();

      // Check if mouse is inside this panel
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        // Get terminal ID from the wrapper inside
        const wrapper = panel.querySelector('.terminal-wrapper');
        const terminalId = wrapper?.id?.replace('terminal-', '') || null;

        // Don't allow dropping on itself
        if (terminalId === draggedTerminalId) {
          return null;
        }

        const position = this.getDropPosition(x, y, rect);

        return {
          position,
          targetTerminalId: terminalId,
          rect,
        };
      }
    }

    // If no panels found, check the container itself (for empty state)
    const containerRect = this.container.getBoundingClientRect();
    if (x >= containerRect.left && x <= containerRect.right &&
        y >= containerRect.top && y <= containerRect.bottom) {
      return {
        position: 'center',
        targetTerminalId: null,
        rect: containerRect,
      };
    }

    return null;
  }

  private getDropPosition(x: number, y: number, rect: DOMRect): DropPosition {
    const relX = (x - rect.left) / rect.width;
    const relY = (y - rect.top) / rect.height;

    // Check edges first (25% threshold)
    const threshold = this.edgeThreshold;

    // Determine the closest edge
    const distances = {
      left: relX,
      right: 1 - relX,
      top: relY,
      bottom: 1 - relY,
    };

    // Find minimum distance
    let minEdge: DropPosition = 'center';
    let minDistance = threshold;

    for (const [edge, distance] of Object.entries(distances)) {
      if (distance < minDistance) {
        minDistance = distance;
        minEdge = edge as DropPosition;
      }
    }

    return minEdge;
  }

  detectTabDropPosition(x: number, y: number, tabsContainer: HTMLElement): { index: number; element: HTMLElement | null } | null {
    const tabs = tabsContainer.querySelectorAll('.tab');

    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i] as HTMLElement;
      const rect = tab.getBoundingClientRect();

      if (y >= rect.top && y <= rect.bottom) {
        // Check if mouse is over this tab
        if (x >= rect.left && x <= rect.right) {
          const midX = rect.left + rect.width / 2;
          if (x < midX) {
            return { index: i, element: tab };
          } else {
            return { index: i + 1, element: tab };
          }
        }

        // Check if before first tab
        if (i === 0 && x < rect.left) {
          return { index: 0, element: tab };
        }
      }
    }

    // After last tab
    if (tabs.length > 0) {
      const lastTab = tabs[tabs.length - 1] as HTMLElement;
      const rect = lastTab.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom && x >= rect.right) {
        return { index: tabs.length, element: null };
      }
    }

    return null;
  }
}
