import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface Attachment {
  id: string;
  path: string;           // Original file path only
  title?: string;
  linkedProjectId?: string;
  timestamp: number;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];

class AttachmentManager {
  private attachmentsPath: string;
  private attachments: Map<string, Attachment> = new Map();

  constructor() {
    const userDataPath = app.getPath('userData');
    this.attachmentsPath = path.join(userDataPath, 'attachments.json');
    this.load();
  }

  private validateFilePath(filePath: string): void {
    // Normalize and resolve the path
    const resolved = path.resolve(filePath);

    // Reject paths containing '..'
    if (filePath.includes('..')) {
      throw new Error('Path traversal detected: ".." is not allowed');
    }

    // Check symlink
    try {
      const realPath = fs.realpathSync(resolved);
      if (realPath !== resolved) {
        throw new Error('Symbolic links are not allowed');
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('File not found');
      }
      throw err;
    }

    // Validate extension
    const ext = path.extname(resolved).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new Error(`File type "${ext}" is not allowed`);
    }

    // Check file size
    const stats = fs.statSync(resolved);
    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(`File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(this.attachmentsPath)) {
        const data = fs.readFileSync(this.attachmentsPath, 'utf-8');
        const loaded: Attachment[] = JSON.parse(data);
        this.attachments.clear();
        loaded.forEach(attachment => {
          this.attachments.set(attachment.id, attachment);
        });
      }
    } catch (error) {
      console.error('Failed to load attachments:', error);
    }
  }

  private save(): void {
    try {
      const attachments = Array.from(this.attachments.values());
      fs.writeFileSync(this.attachmentsPath, JSON.stringify(attachments, null, 2));
    } catch (error) {
      console.error('Failed to save attachments:', error);
    }
  }

  addAttachment(filePath: string, title?: string, linkedProjectId?: string): Attachment {
    this.validateFilePath(filePath);

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const attachment: Attachment = {
      id,
      path: path.resolve(filePath),
      title,
      linkedProjectId,
      timestamp: Date.now(),
    };
    this.attachments.set(id, attachment);
    this.save();
    return attachment;
  }

  removeAttachment(id: string): boolean {
    const deleted = this.attachments.delete(id);
    if (deleted) {
      this.save();
    }
    return deleted;
  }

  updateAttachment(id: string, updates: Partial<Pick<Attachment, 'title' | 'linkedProjectId'>>): Attachment | null {
    const attachment = this.attachments.get(id);
    if (!attachment) return null;

    if (updates.title !== undefined) {
      attachment.title = updates.title;
    }
    if (updates.linkedProjectId !== undefined) {
      attachment.linkedProjectId = updates.linkedProjectId;
    }

    this.save();
    return attachment;
  }

  getAttachments(): Attachment[] {
    // Return attachments with file existence check
    return Array.from(this.attachments.values()).map(attachment => ({
      ...attachment,
    }));
  }

  getAttachment(id: string): Attachment | null {
    return this.attachments.get(id) || null;
  }

  checkFileExists(filePath: string): boolean {
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  readImageAsBase64(filePath: string): string | null {
    try {
      this.validateFilePath(filePath);
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      let mimeType = 'image/png';
      if (ext === '.jpg' || ext === '.jpeg') {
        mimeType = 'image/jpeg';
      } else if (ext === '.gif') {
        mimeType = 'image/gif';
      } else if (ext === '.webp') {
        mimeType = 'image/webp';
      } else if (ext === '.svg') {
        mimeType = 'image/svg+xml';
      }
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    } catch (error) {
      console.error('Failed to read image:', error);
      return null;
    }
  }
}

export const attachmentManager = new AttachmentManager();
