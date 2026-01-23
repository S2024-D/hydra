import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface TerminalSession {
  id: string;
  name: string;
  cwd: string;
  projectId: string | null;
}

export interface ProjectSession {
  id: string;
  name: string;
  path: string;
  terminalIds: string[];
}

export interface SessionData {
  terminals: TerminalSession[];
  projects: ProjectSession[];
  activeTerminalId: string | null;
  activeProjectId: string | null;
}

class SessionManager {
  private sessionPath: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.sessionPath = path.join(userDataPath, 'session.json');
  }

  save(data: SessionData): void {
    try {
      fs.writeFileSync(this.sessionPath, JSON.stringify(data, null, 2));
      console.log('Session saved to:', this.sessionPath);
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }

  load(): SessionData | null {
    try {
      if (fs.existsSync(this.sessionPath)) {
        const data = fs.readFileSync(this.sessionPath, 'utf-8');
        console.log('Session loaded from:', this.sessionPath);
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    }
    return null;
  }

  clear(): void {
    try {
      if (fs.existsSync(this.sessionPath)) {
        fs.unlinkSync(this.sessionPath);
      }
    } catch (error) {
      console.error('Failed to clear session:', error);
    }
  }
}

export const sessionManager = new SessionManager();
