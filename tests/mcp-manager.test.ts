import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
  },
}));

// Mock fs so it doesn't actually load/save
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  realpathSync: vi.fn((p: string) => p),
  statSync: vi.fn(() => ({ size: 100 })),
}));

describe('MCP Manager', () => {
  describe('schema validation', () => {
    // Test validateSchema logic inline
    function validateSchema(schema: unknown): boolean {
      if (!schema || typeof schema !== 'object') return false;
      const s = schema as Record<string, unknown>;
      if (typeof s.name !== 'string' || !s.name.trim()) return false;
      if (typeof s.command !== 'string' || !s.command.trim()) return false;
      if (!Array.isArray(s.args)) return false;
      if (!Array.isArray(s.fields)) return false;
      if (!s.envMapping || typeof s.envMapping !== 'object') return false;

      for (const field of s.fields as any[]) {
        if (!field || typeof field !== 'object') return false;
        if (typeof field.key !== 'string' || !field.key.trim()) return false;
        if (typeof field.label !== 'string' || !field.label.trim()) return false;
        if (!['text', 'password', 'textarea', 'checkbox', 'number'].includes(field.type)) return false;
      }
      return true;
    }

    it('should validate a correct schema', () => {
      const schema = {
        name: 'Test Server',
        command: 'npx',
        args: ['-y', 'test-server'],
        fields: [
          { key: 'token', label: 'API Token', type: 'password' },
        ],
        envMapping: { token: 'API_TOKEN' },
      };
      expect(validateSchema(schema)).toBe(true);
    });

    it('should reject schema without name', () => {
      expect(validateSchema({ command: 'npx', args: [], fields: [], envMapping: {} })).toBe(false);
    });

    it('should reject schema with empty name', () => {
      expect(validateSchema({ name: '  ', command: 'npx', args: [], fields: [], envMapping: {} })).toBe(false);
    });

    it('should reject schema without command', () => {
      expect(validateSchema({ name: 'Test', args: [], fields: [], envMapping: {} })).toBe(false);
    });

    it('should reject schema with invalid field type', () => {
      const schema = {
        name: 'Test',
        command: 'npx',
        args: [],
        fields: [{ key: 'k', label: 'L', type: 'invalid' }],
        envMapping: {},
      };
      expect(validateSchema(schema)).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(validateSchema(null)).toBe(false);
      expect(validateSchema(undefined)).toBe(false);
    });

    it('should reject non-object', () => {
      expect(validateSchema('string')).toBe(false);
      expect(validateSchema(42)).toBe(false);
    });
  });

  describe('URL validation', () => {
    // Test SSRF protection logic inline
    function isPrivateHost(hostname: string): boolean {
      const privatePatterns = [
        /^localhost$/i,
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[01])\./,
        /^192\.168\./,
        /^0\./,
        /^169\.254\./,
        /^\[::1\]$/,
        /^\[fc/i,
        /^\[fd/i,
        /^\[fe80:/i,
      ];
      return privatePatterns.some(pattern => pattern.test(hostname));
    }

    it('should block localhost', () => {
      expect(isPrivateHost('localhost')).toBe(true);
      expect(isPrivateHost('LOCALHOST')).toBe(true);
    });

    it('should block 127.x.x.x', () => {
      expect(isPrivateHost('127.0.0.1')).toBe(true);
      expect(isPrivateHost('127.1.2.3')).toBe(true);
    });

    it('should block 10.x.x.x', () => {
      expect(isPrivateHost('10.0.0.1')).toBe(true);
    });

    it('should block 192.168.x.x', () => {
      expect(isPrivateHost('192.168.1.1')).toBe(true);
    });

    it('should block 172.16-31.x.x', () => {
      expect(isPrivateHost('172.16.0.1')).toBe(true);
      expect(isPrivateHost('172.31.255.255')).toBe(true);
    });

    it('should allow public IPs', () => {
      expect(isPrivateHost('8.8.8.8')).toBe(false);
      expect(isPrivateHost('github.com')).toBe(false);
    });

    it('should block link-local addresses', () => {
      expect(isPrivateHost('169.254.1.1')).toBe(true);
    });
  });

  describe('environment variable sanitization', () => {
    function sanitizeEnvValue(value: string): string {
      return value.replace(/[;&|`$(){}!<>\n\r]/g, '');
    }

    it('should remove shell metacharacters', () => {
      expect(sanitizeEnvValue('value; rm -rf /')).toBe('value rm -rf /');
      expect(sanitizeEnvValue('value | cat /etc/passwd')).toBe('value  cat /etc/passwd');
      expect(sanitizeEnvValue('$(whoami)')).toBe('whoami');
      expect(sanitizeEnvValue('value`cmd`')).toBe('valuecmd');
    });

    it('should preserve normal values', () => {
      expect(sanitizeEnvValue('my-api-token-123')).toBe('my-api-token-123');
      expect(sanitizeEnvValue('https://example.com/api')).toBe('https://example.com/api');
    });

    it('should handle empty string', () => {
      expect(sanitizeEnvValue('')).toBe('');
    });
  });
});
