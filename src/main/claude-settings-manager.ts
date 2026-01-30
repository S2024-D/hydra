import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface HookConfig {
  type: 'command' | 'prompt';
  command?: string;
  prompt?: string;
  timeout?: number;
}

export interface HookEntry {
  matcher?: string;
  hooks: HookConfig[];
}

export interface ClaudeHooks {
  [eventName: string]: HookEntry[];
}

export interface ClaudeSettings {
  hooks?: ClaudeHooks;
  [key: string]: unknown;
}

export interface FlattenedHook {
  id: string;
  eventName: string;
  entryIndex: number;
  hookIndex: number;
  matcher?: string;
  type: 'command' | 'prompt';
  command?: string;
  prompt?: string;
  timeout?: number;
}

class ClaudeSettingsManager {
  private settingsPath: string;

  constructor() {
    this.settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.settingsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  loadSettings(): ClaudeSettings {
    try {
      if (!fs.existsSync(this.settingsPath)) {
        return {};
      }
      const content = fs.readFileSync(this.settingsPath, 'utf-8');
      return JSON.parse(content) as ClaudeSettings;
    } catch {
      return {};
    }
  }

  saveSettings(settings: ClaudeSettings): void {
    this.ensureDirectory();
    fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  getHooks(): FlattenedHook[] {
    const settings = this.loadSettings();
    const flattenedHooks: FlattenedHook[] = [];

    if (!settings.hooks) {
      return flattenedHooks;
    }

    for (const eventName of Object.keys(settings.hooks)) {
      const entries = settings.hooks[eventName];
      entries.forEach((entry, entryIndex) => {
        entry.hooks.forEach((hook, hookIndex) => {
          flattenedHooks.push({
            id: `${eventName}-${entryIndex}-${hookIndex}`,
            eventName,
            entryIndex,
            hookIndex,
            matcher: entry.matcher,
            type: hook.type,
            command: hook.command,
            prompt: hook.prompt,
            timeout: hook.timeout,
          });
        });
      });
    }

    return flattenedHooks;
  }

  addHook(
    eventName: string,
    matcher: string | undefined,
    hookConfig: HookConfig
  ): FlattenedHook[] {
    const settings = this.loadSettings();

    if (!settings.hooks) {
      settings.hooks = {};
    }

    if (!settings.hooks[eventName]) {
      settings.hooks[eventName] = [];
    }

    // Find existing entry with same matcher or create new one
    let entry = settings.hooks[eventName].find((e) => e.matcher === matcher);
    if (!entry) {
      entry = { matcher, hooks: [] };
      settings.hooks[eventName].push(entry);
    }

    entry.hooks.push(hookConfig);
    this.saveSettings(settings);

    return this.getHooks();
  }

  updateHook(
    eventName: string,
    entryIndex: number,
    hookIndex: number,
    newMatcher: string | undefined,
    hookConfig: HookConfig
  ): FlattenedHook[] {
    const settings = this.loadSettings();

    if (!settings.hooks?.[eventName]?.[entryIndex]?.hooks?.[hookIndex]) {
      return this.getHooks();
    }

    const entry = settings.hooks[eventName][entryIndex];
    const oldMatcher = entry.matcher;

    // If matcher changed and this is the only hook in entry, update matcher
    if (oldMatcher !== newMatcher) {
      if (entry.hooks.length === 1) {
        entry.matcher = newMatcher;
      } else {
        // Remove hook from old entry and add to new/existing entry
        entry.hooks.splice(hookIndex, 1);
        if (entry.hooks.length === 0) {
          settings.hooks[eventName].splice(entryIndex, 1);
        }

        // Find or create entry with new matcher
        let newEntry = settings.hooks[eventName].find((e) => e.matcher === newMatcher);
        if (!newEntry) {
          newEntry = { matcher: newMatcher, hooks: [] };
          settings.hooks[eventName].push(newEntry);
        }
        newEntry.hooks.push(hookConfig);
        this.saveSettings(settings);
        return this.getHooks();
      }
    }

    // Update hook config
    entry.hooks[hookIndex] = hookConfig;
    this.saveSettings(settings);

    return this.getHooks();
  }

  removeHook(eventName: string, entryIndex: number, hookIndex: number): FlattenedHook[] {
    const settings = this.loadSettings();

    if (!settings.hooks?.[eventName]?.[entryIndex]?.hooks?.[hookIndex]) {
      return this.getHooks();
    }

    const entry = settings.hooks[eventName][entryIndex];
    entry.hooks.splice(hookIndex, 1);

    // Clean up empty entries
    if (entry.hooks.length === 0) {
      settings.hooks[eventName].splice(entryIndex, 1);
    }

    // Clean up empty event arrays
    if (settings.hooks[eventName].length === 0) {
      delete settings.hooks[eventName];
    }

    // Clean up empty hooks object
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }

    this.saveSettings(settings);
    return this.getHooks();
  }

  fileExists(): boolean {
    return fs.existsSync(this.settingsPath);
  }

  getFilePath(): string {
    return this.settingsPath;
  }
}

export const claudeSettingsManager = new ClaudeSettingsManager();
