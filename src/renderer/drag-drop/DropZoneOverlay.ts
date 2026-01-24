import { DropZone, DropPosition } from './types';

export class DropZoneOverlay {
  private overlay: HTMLElement;
  private tabIndicator: HTMLElement;

  constructor() {
    this.overlay = this.createOverlay();
    this.tabIndicator = this.createTabIndicator();
    document.body.appendChild(this.overlay);
    document.body.appendChild(this.tabIndicator);
  }

  private createOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'drop-zone-overlay';
    overlay.style.display = 'none';
    return overlay;
  }

  private createTabIndicator(): HTMLElement {
    const indicator = document.createElement('div');
    indicator.className = 'tab-drop-indicator';
    indicator.style.display = 'none';
    return indicator;
  }

  showDropZone(zone: DropZone): void {
    this.hideTabIndicator();
    this.overlay.style.display = 'block';

    const { rect, position } = zone;

    // Calculate highlight area based on position
    let left: number, top: number, width: number, height: number;

    switch (position) {
      case 'left':
        left = rect.left;
        top = rect.top;
        width = rect.width * 0.5;
        height = rect.height;
        break;
      case 'right':
        left = rect.left + rect.width * 0.5;
        top = rect.top;
        width = rect.width * 0.5;
        height = rect.height;
        break;
      case 'top':
        left = rect.left;
        top = rect.top;
        width = rect.width;
        height = rect.height * 0.5;
        break;
      case 'bottom':
        left = rect.left;
        top = rect.top + rect.height * 0.5;
        width = rect.width;
        height = rect.height * 0.5;
        break;
      case 'center':
      default:
        left = rect.left;
        top = rect.top;
        width = rect.width;
        height = rect.height;
        break;
    }

    this.overlay.style.left = `${left}px`;
    this.overlay.style.top = `${top}px`;
    this.overlay.style.width = `${width}px`;
    this.overlay.style.height = `${height}px`;
    this.overlay.dataset.position = position;
  }

  showTabIndicator(x: number, tabsContainer: HTMLElement): void {
    this.hideDropZone();
    const containerRect = tabsContainer.getBoundingClientRect();

    this.tabIndicator.style.display = 'block';
    this.tabIndicator.style.left = `${x}px`;
    this.tabIndicator.style.top = `${containerRect.top}px`;
    this.tabIndicator.style.height = `${containerRect.height}px`;
  }

  hideDropZone(): void {
    this.overlay.style.display = 'none';
  }

  hideTabIndicator(): void {
    this.tabIndicator.style.display = 'none';
  }

  hide(): void {
    this.hideDropZone();
    this.hideTabIndicator();
  }

  destroy(): void {
    this.overlay.remove();
    this.tabIndicator.remove();
  }
}
