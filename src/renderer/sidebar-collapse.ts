/**
 * Sidebar Collapse Feature
 * 사이드바 접기 (SidebarManager)
 */

class SidebarManager {
  private collapsed = false;
  private onChangeCallbacks: ((collapsed: boolean) => void)[] = [];

  toggle(): boolean {
    this.collapsed = !this.collapsed;
    document.body.classList.toggle('sidebar-collapsed', this.collapsed);
    this.notifyChange();
    return this.collapsed;
  }

  collapse(): void {
    this.collapsed = true;
    document.body.classList.add('sidebar-collapsed');
    this.notifyChange();
  }

  expand(): void {
    this.collapsed = false;
    document.body.classList.remove('sidebar-collapsed');
    this.notifyChange();
  }

  isCollapsed(): boolean {
    return this.collapsed;
  }

  onChange(callback: (collapsed: boolean) => void): void {
    this.onChangeCallbacks.push(callback);
  }

  private notifyChange(): void {
    this.onChangeCallbacks.forEach(cb => cb(this.collapsed));
  }
}

export const sidebarManager = new SidebarManager();
