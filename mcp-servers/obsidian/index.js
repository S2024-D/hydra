#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// Configuration - Vault path from environment variable
const VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH || '';

// JSON-RPC response helper
function createResponse(id, result) {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function createError(id, code, message) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

// Tool definitions
const TOOLS = [
  {
    name: 'list_notes',
    description: 'List all notes in the Obsidian vault or in a specific folder',
    inputSchema: {
      type: 'object',
      properties: {
        folder: {
          type: 'string',
          description: 'Optional folder path relative to vault root (e.g., "Journal" or "Projects/Work")'
        }
      },
      required: []
    }
  },
  {
    name: 'read_note',
    description: 'Read the content of a note from the Obsidian vault',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the note relative to vault root (e.g., "Daily/2024-01-15.md")'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'create_note',
    description: 'Create a new note in the Obsidian vault',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path for the new note relative to vault root (e.g., "Projects/NewProject.md")'
        },
        content: {
          type: 'string',
          description: 'Content of the note in Markdown format'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'update_note',
    description: 'Update an existing note in the Obsidian vault',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the note relative to vault root'
        },
        content: {
          type: 'string',
          description: 'New content for the note'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'delete_note',
    description: 'Delete a note from the Obsidian vault',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the note to delete relative to vault root'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'search_notes',
    description: 'Search for notes containing specific text',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Text to search for in notes'
        },
        folder: {
          type: 'string',
          description: 'Optional folder to limit search scope'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'create_folder',
    description: 'Create a new folder in the Obsidian vault',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path for the new folder relative to vault root'
        }
      },
      required: ['path']
    }
  }
];

// Tool implementations
function listNotes(folder = '') {
  if (!VAULT_PATH) {
    return { error: 'OBSIDIAN_VAULT_PATH not configured' };
  }

  const targetPath = path.join(VAULT_PATH, folder);

  if (!fs.existsSync(targetPath)) {
    return { error: `Folder not found: ${folder || '(root)'}` };
  }

  const notes = [];

  function scanDir(dir, relativePath = '') {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      // Skip hidden files and .obsidian folder
      if (item.startsWith('.')) continue;

      const fullPath = path.join(dir, item);
      const itemRelativePath = relativePath ? `${relativePath}/${item}` : item;
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scanDir(fullPath, itemRelativePath);
      } else if (item.endsWith('.md')) {
        notes.push({
          path: itemRelativePath,
          name: item.replace('.md', ''),
          modified: stat.mtime.toISOString()
        });
      }
    }
  }

  scanDir(targetPath, folder);
  return { notes, count: notes.length, folder: folder || '(root)' };
}

function readNote(notePath) {
  if (!VAULT_PATH) {
    return { error: 'OBSIDIAN_VAULT_PATH not configured' };
  }

  // Ensure .md extension
  if (!notePath.endsWith('.md')) {
    notePath += '.md';
  }

  const fullPath = path.join(VAULT_PATH, notePath);

  if (!fs.existsSync(fullPath)) {
    return { error: `Note not found: ${notePath}` };
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const stat = fs.statSync(fullPath);

  return {
    path: notePath,
    content,
    modified: stat.mtime.toISOString(),
    size: stat.size
  };
}

function createNote(notePath, content) {
  if (!VAULT_PATH) {
    return { error: 'OBSIDIAN_VAULT_PATH not configured' };
  }

  // Ensure .md extension
  if (!notePath.endsWith('.md')) {
    notePath += '.md';
  }

  const fullPath = path.join(VAULT_PATH, notePath);

  if (fs.existsSync(fullPath)) {
    return { error: `Note already exists: ${notePath}` };
  }

  // Create parent directories if needed
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(fullPath, content, 'utf-8');

  return {
    success: true,
    path: notePath,
    message: `Note created: ${notePath}`
  };
}

function updateNote(notePath, content) {
  if (!VAULT_PATH) {
    return { error: 'OBSIDIAN_VAULT_PATH not configured' };
  }

  // Ensure .md extension
  if (!notePath.endsWith('.md')) {
    notePath += '.md';
  }

  const fullPath = path.join(VAULT_PATH, notePath);

  if (!fs.existsSync(fullPath)) {
    return { error: `Note not found: ${notePath}` };
  }

  fs.writeFileSync(fullPath, content, 'utf-8');

  return {
    success: true,
    path: notePath,
    message: `Note updated: ${notePath}`
  };
}

function deleteNote(notePath) {
  if (!VAULT_PATH) {
    return { error: 'OBSIDIAN_VAULT_PATH not configured' };
  }

  // Ensure .md extension
  if (!notePath.endsWith('.md')) {
    notePath += '.md';
  }

  const fullPath = path.join(VAULT_PATH, notePath);

  if (!fs.existsSync(fullPath)) {
    return { error: `Note not found: ${notePath}` };
  }

  fs.unlinkSync(fullPath);

  return {
    success: true,
    path: notePath,
    message: `Note deleted: ${notePath}`
  };
}

function searchNotes(query, folder = '') {
  if (!VAULT_PATH) {
    return { error: 'OBSIDIAN_VAULT_PATH not configured' };
  }

  const targetPath = path.join(VAULT_PATH, folder);
  const results = [];
  const queryLower = query.toLowerCase();

  function searchDir(dir, relativePath = '') {
    if (!fs.existsSync(dir)) return;

    const items = fs.readdirSync(dir);
    for (const item of items) {
      if (item.startsWith('.')) continue;

      const fullPath = path.join(dir, item);
      const itemRelativePath = relativePath ? `${relativePath}/${item}` : item;
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        searchDir(fullPath, itemRelativePath);
      } else if (item.endsWith('.md')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        if (content.toLowerCase().includes(queryLower) || item.toLowerCase().includes(queryLower)) {
          // Find matching lines
          const lines = content.split('\n');
          const matches = [];
          lines.forEach((line, index) => {
            if (line.toLowerCase().includes(queryLower)) {
              matches.push({ line: index + 1, text: line.trim().substring(0, 100) });
            }
          });

          results.push({
            path: itemRelativePath,
            name: item.replace('.md', ''),
            matches: matches.slice(0, 5) // Limit to 5 matches per file
          });
        }
      }
    }
  }

  searchDir(targetPath, folder);
  return { query, results, count: results.length };
}

function createFolder(folderPath) {
  if (!VAULT_PATH) {
    return { error: 'OBSIDIAN_VAULT_PATH not configured' };
  }

  const fullPath = path.join(VAULT_PATH, folderPath);

  if (fs.existsSync(fullPath)) {
    return { error: `Folder already exists: ${folderPath}` };
  }

  fs.mkdirSync(fullPath, { recursive: true });

  return {
    success: true,
    path: folderPath,
    message: `Folder created: ${folderPath}`
  };
}

// Handle tool calls
function handleToolCall(name, args) {
  switch (name) {
    case 'list_notes':
      return listNotes(args?.folder);
    case 'read_note':
      return readNote(args?.path);
    case 'create_note':
      return createNote(args?.path, args?.content);
    case 'update_note':
      return updateNote(args?.path, args?.content);
    case 'delete_note':
      return deleteNote(args?.path);
    case 'search_notes':
      return searchNotes(args?.query, args?.folder);
    case 'create_folder':
      return createFolder(args?.path);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// Handle JSON-RPC messages
function handleMessage(message) {
  const { id, method, params } = message;

  switch (method) {
    case 'initialize':
      return createResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: { listChanged: false }
        },
        serverInfo: {
          name: 'obsidian-mcp-server',
          version: '1.0.0'
        }
      });

    case 'notifications/initialized':
      // No response needed for notifications
      return null;

    case 'tools/list':
      return createResponse(id, { tools: TOOLS });

    case 'tools/call':
      const { name, arguments: args } = params || {};
      const result = handleToolCall(name, args);

      if (result.error) {
        return createResponse(id, {
          content: [{ type: 'text', text: `Error: ${result.error}` }],
          isError: true
        });
      }

      return createResponse(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      });

    case 'ping':
      return createResponse(id, {});

    default:
      return createError(id, -32601, `Method not found: ${method}`);
  }
}

// Main entry point
function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', (line) => {
    if (!line.trim()) return;

    try {
      const message = JSON.parse(line);
      const response = handleMessage(message);

      if (response) {
        console.log(response);
      }
    } catch (error) {
      console.error(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' }
      }));
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });

  // Log startup to stderr (not stdout to avoid protocol interference)
  process.stderr.write(`[Obsidian MCP] Server started. Vault: ${VAULT_PATH || '(not configured)'}\n`);
}

main();
