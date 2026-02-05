import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir()),
  },
}));

describe('AttachmentManager - Path Validation', () => {
  const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  // Use realpath to avoid macOS /var -> /private/var symlink issues
  const realTmpDir = fs.realpathSync(os.tmpdir());

  // Inline the validation logic for testing
  function validateFilePath(filePath: string): void {
    const resolved = path.resolve(filePath);

    if (filePath.includes('..')) {
      throw new Error('Path traversal detected: ".." is not allowed');
    }

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

    const ext = path.extname(resolved).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new Error(`File type "${ext}" is not allowed`);
    }

    const stats = fs.statSync(resolved);
    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(`File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
    }
  }

  let tmpFile: string;

  beforeEach(() => {
    tmpFile = path.join(realTmpDir, `test-${Date.now()}.png`);
    fs.writeFileSync(tmpFile, Buffer.alloc(100));
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  describe('path traversal protection', () => {
    it('should reject paths with ..', () => {
      expect(() => validateFilePath('/home/user/../etc/passwd.png')).toThrow('Path traversal detected');
    });

    it('should reject relative paths with ..', () => {
      expect(() => validateFilePath('../../etc/passwd.png')).toThrow('Path traversal detected');
    });
  });

  describe('extension validation', () => {
    it('should accept allowed image extensions', () => {
      for (const ext of ALLOWED_EXTENSIONS) {
        const testFile = path.join(realTmpDir, `test-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
        fs.writeFileSync(testFile, Buffer.alloc(100));
        try {
          expect(() => validateFilePath(testFile)).not.toThrow();
        } finally {
          try { fs.unlinkSync(testFile); } catch {}
        }
      }
    });

    it('should reject non-image extensions', () => {
      const badFile = path.join(realTmpDir, `test-${Date.now()}.exe`);
      fs.writeFileSync(badFile, Buffer.alloc(100));
      try {
        expect(() => validateFilePath(badFile)).toThrow('File type ".exe" is not allowed');
      } finally {
        try { fs.unlinkSync(badFile); } catch {}
      }
    });
  });

  describe('file size validation', () => {
    it('should accept files under 50MB', () => {
      expect(() => validateFilePath(tmpFile)).not.toThrow();
    });

    it('should reject files over 50MB', () => {
      const bigFile = path.join(realTmpDir, `big-${Date.now()}.png`);
      fs.writeFileSync(bigFile, Buffer.alloc(MAX_FILE_SIZE + 1));
      try {
        expect(() => validateFilePath(bigFile)).toThrow('File too large');
      } finally {
        try { fs.unlinkSync(bigFile); } catch {}
      }
    });
  });

  describe('file existence', () => {
    it('should reject non-existent files', () => {
      expect(() => validateFilePath('/nonexistent/path/image.png')).toThrow('File not found');
    });
  });

  describe('symlink detection', () => {
    it('should reject symbolic links', () => {
      const linkPath = path.join(realTmpDir, `link-${Date.now()}.png`);
      try {
        fs.symlinkSync(tmpFile, linkPath);
        expect(() => validateFilePath(linkPath)).toThrow('Symbolic links are not allowed');
      } finally {
        try { fs.unlinkSync(linkPath); } catch {}
      }
    });
  });
});
