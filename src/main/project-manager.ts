import { dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface Project {
  id: string;
  name: string;
  path: string;
  terminalIds: string[];
}

class ProjectManager {
  private projects: Map<string, Project> = new Map();
  private activeProjectId: string | null = null;
  private idCounter = 0;

  async addProject(projectPath?: string): Promise<Project | null> {
    let selectedPath = projectPath;

    if (!selectedPath) {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Project Folder',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      selectedPath = result.filePaths[0];
    }

    // Check if project already exists
    for (const project of this.projects.values()) {
      if (project.path === selectedPath) {
        return project;
      }
    }

    const id = `project-${++this.idCounter}`;
    const name = path.basename(selectedPath);

    const project: Project = {
      id,
      name,
      path: selectedPath,
      terminalIds: [],
    };

    this.projects.set(id, project);

    if (!this.activeProjectId) {
      this.activeProjectId = id;
    }

    return project;
  }

  removeProject(id: string): boolean {
    const project = this.projects.get(id);
    if (!project) return false;

    this.projects.delete(id);

    if (this.activeProjectId === id) {
      const remaining = Array.from(this.projects.keys());
      this.activeProjectId = remaining.length > 0 ? remaining[0] : null;
    }

    return true;
  }

  getProject(id: string): Project | undefined {
    return this.projects.get(id);
  }

  getAllProjects(): Project[] {
    return Array.from(this.projects.values());
  }

  getActiveProject(): Project | null {
    if (!this.activeProjectId) return null;
    return this.projects.get(this.activeProjectId) || null;
  }

  setActiveProject(id: string): boolean {
    if (!this.projects.has(id)) return false;
    this.activeProjectId = id;
    return true;
  }

  addTerminalToProject(projectId: string, terminalId: string): void {
    const project = this.projects.get(projectId);
    if (project && !project.terminalIds.includes(terminalId)) {
      project.terminalIds.push(terminalId);
    }
  }

  removeTerminalFromProject(projectId: string, terminalId: string): void {
    const project = this.projects.get(projectId);
    if (project) {
      project.terminalIds = project.terminalIds.filter((id) => id !== terminalId);
    }
  }

  getProjectByTerminal(terminalId: string): Project | null {
    for (const project of this.projects.values()) {
      if (project.terminalIds.includes(terminalId)) {
        return project;
      }
    }
    return null;
  }
}

export const projectManager = new ProjectManager();
