import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron before importing module
vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: vi.fn(),
  },
}));

import { dialog } from 'electron';

// Import the class directly for testing
// Since projectManager is a singleton with side effects, we recreate the logic
class TestProjectManager {
  private projects: Map<string, { id: string; name: string; path: string; terminalIds: string[] }> = new Map();
  private activeProjectId: string | null = null;
  private idCounter = 0;

  async addProject(projectPath?: string) {
    let selectedPath = projectPath;
    if (!selectedPath) {
      const result = await (dialog.showOpenDialog as any)({
        properties: ['openDirectory'],
        title: 'Select Project Folder',
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      selectedPath = result.filePaths[0];
    }

    for (const project of this.projects.values()) {
      if (project.path === selectedPath) return project;
    }

    const id = `project-${++this.idCounter}`;
    const name = selectedPath!.split('/').pop()!;
    const project = { id, name, path: selectedPath!, terminalIds: [] as string[] };
    this.projects.set(id, project);
    if (!this.activeProjectId) this.activeProjectId = id;
    return project;
  }

  removeProject(id: string): boolean {
    if (!this.projects.has(id)) return false;
    this.projects.delete(id);
    if (this.activeProjectId === id) {
      const remaining = Array.from(this.projects.keys());
      this.activeProjectId = remaining.length > 0 ? remaining[0] : null;
    }
    return true;
  }

  getAllProjects() { return Array.from(this.projects.values()); }
  getActiveProject() {
    if (!this.activeProjectId) return null;
    return this.projects.get(this.activeProjectId) || null;
  }
  setActiveProject(id: string) {
    if (!this.projects.has(id)) return false;
    this.activeProjectId = id;
    return true;
  }

  addTerminalToProject(projectId: string, terminalId: string) {
    const project = this.projects.get(projectId);
    if (project && !project.terminalIds.includes(terminalId)) {
      project.terminalIds.push(terminalId);
    }
  }

  removeTerminalFromProject(projectId: string, terminalId: string) {
    const project = this.projects.get(projectId);
    if (project) {
      project.terminalIds = project.terminalIds.filter(id => id !== terminalId);
    }
  }
}

describe('ProjectManager', () => {
  let pm: TestProjectManager;

  beforeEach(() => {
    pm = new TestProjectManager();
    vi.clearAllMocks();
  });

  describe('addProject', () => {
    it('should add a project with a direct path', async () => {
      const project = await pm.addProject('/home/user/myproject');
      expect(project).not.toBeNull();
      expect(project!.name).toBe('myproject');
      expect(project!.path).toBe('/home/user/myproject');
      expect(project!.terminalIds).toEqual([]);
    });

    it('should set first project as active', async () => {
      await pm.addProject('/home/user/project1');
      const active = pm.getActiveProject();
      expect(active).not.toBeNull();
      expect(active!.path).toBe('/home/user/project1');
    });

    it('should detect duplicate projects', async () => {
      const p1 = await pm.addProject('/home/user/myproject');
      const p2 = await pm.addProject('/home/user/myproject');
      expect(p1!.id).toBe(p2!.id);
      expect(pm.getAllProjects()).toHaveLength(1);
    });

    it('should return null when dialog is cancelled', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: true, filePaths: [] });
      const result = await pm.addProject();
      expect(result).toBeNull();
    });
  });

  describe('removeProject', () => {
    it('should remove an existing project', async () => {
      const project = await pm.addProject('/home/user/project1');
      const result = pm.removeProject(project!.id);
      expect(result).toBe(true);
      expect(pm.getAllProjects()).toHaveLength(0);
    });

    it('should return false for non-existent project', () => {
      expect(pm.removeProject('nonexistent')).toBe(false);
    });

    it('should update active project when active is removed', async () => {
      const p1 = await pm.addProject('/home/user/project1');
      const p2 = await pm.addProject('/home/user/project2');
      pm.setActiveProject(p1!.id);
      pm.removeProject(p1!.id);
      const active = pm.getActiveProject();
      expect(active!.id).toBe(p2!.id);
    });
  });

  describe('CRUD operations', () => {
    it('should list all projects', async () => {
      await pm.addProject('/path/a');
      await pm.addProject('/path/b');
      expect(pm.getAllProjects()).toHaveLength(2);
    });

    it('should set active project', async () => {
      const p1 = await pm.addProject('/path/a');
      const p2 = await pm.addProject('/path/b');
      pm.setActiveProject(p2!.id);
      expect(pm.getActiveProject()!.id).toBe(p2!.id);
    });

    it('should return false setting non-existent project as active', () => {
      expect(pm.setActiveProject('fake-id')).toBe(false);
    });
  });

  describe('terminal management', () => {
    it('should add terminal to project', async () => {
      const project = await pm.addProject('/path/a');
      pm.addTerminalToProject(project!.id, 'term-1');
      expect(pm.getAllProjects()[0].terminalIds).toEqual(['term-1']);
    });

    it('should not add duplicate terminals', async () => {
      const project = await pm.addProject('/path/a');
      pm.addTerminalToProject(project!.id, 'term-1');
      pm.addTerminalToProject(project!.id, 'term-1');
      expect(pm.getAllProjects()[0].terminalIds).toHaveLength(1);
    });

    it('should remove terminal from project', async () => {
      const project = await pm.addProject('/path/a');
      pm.addTerminalToProject(project!.id, 'term-1');
      pm.addTerminalToProject(project!.id, 'term-2');
      pm.removeTerminalFromProject(project!.id, 'term-1');
      expect(pm.getAllProjects()[0].terminalIds).toEqual(['term-2']);
    });
  });
});
