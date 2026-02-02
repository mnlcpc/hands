const fs = require('fs-extra');
const path = require('path');
const tracker = require('./tracker');
const { toClaudeCode, toCursor, TOOL_TARGETS } = require('./adapters');

/**
 * Reads a JSON file, returning default if missing or corrupted
 * @param {string} filePath - Path to JSON file
 * @param {Object} defaultValue - Default value if file doesn't exist
 * @returns {Promise<Object>}
 */
async function readJsonFile(filePath, defaultValue = {}) {
  const resolvedPath = path.resolve(filePath);
  try {
    if (await fs.pathExists(resolvedPath)) {
      return await fs.readJson(resolvedPath);
    }
  } catch {
    // Corrupted file, return default
  }
  return defaultValue;
}

/**
 * Writes a JSON file, creating directories as needed
 * @param {string} filePath - Path to JSON file
 * @param {Object} content - Content to write
 * @returns {Promise<void>}
 */
async function writeJsonFile(filePath, content) {
  const resolvedPath = path.resolve(filePath);
  await fs.ensureDir(path.dirname(resolvedPath));
  await fs.writeJson(resolvedPath, content, { spaces: 2 });
}

// --- MCP Server operations (used by resolver for dependency management) ---

/**
 * Adds or updates an MCP server in mcp.json
 * @param {string} targetFile - Path to mcp.json
 * @param {string} serverName - Server name
 * @param {Object} serverConfig - Server configuration
 * @returns {Promise<void>}
 */
async function addMcpServer(targetFile, serverName, serverConfig) {
  const config = await readJsonFile(targetFile, {});
  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers[serverName] = serverConfig;
  await writeJsonFile(targetFile, config);
}

/**
 * Removes an MCP server from mcp.json
 * @param {string} targetFile - Path to mcp.json
 * @param {string} serverName - Server name to remove
 * @returns {Promise<void>}
 */
async function removeMcpServer(targetFile, serverName) {
  const config = await readJsonFile(targetFile, {});
  if (config.mcpServers) {
    delete config.mcpServers[serverName];
  }
  await writeJsonFile(targetFile, config);
}

/**
 * Gets a specific MCP server config
 * @param {string} targetFile - Path to mcp.json
 * @param {string} serverName - Server name
 * @returns {Promise<Object|null>}
 */
async function getMcpServer(targetFile, serverName) {
  const config = await readJsonFile(targetFile, {});
  return config.mcpServers?.[serverName] ?? null;
}

// --- Claude Code hook operations ---

/**
 * Gets hooks configuration from Claude Code settings.json
 * @param {string} targetFile - Path to settings.json
 * @returns {Promise<Object>}
 */
async function getHooks(targetFile = '.claude/settings.json') {
  const settings = await readJsonFile(targetFile, {});
  return settings.hooks ?? {};
}

/**
 * Merges translated Claude Code hook config into settings.json
 * @param {string} targetFile - Path to settings.json
 * @param {string} hookName - Identifier for tracking
 * @param {Object} hookConfig - Translated Claude Code hook format { EventType: [matcherObjects] }
 * @returns {Promise<void>}
 */
async function mergeHook(targetFile, hookName, hookConfig) {
  const settings = await readJsonFile(targetFile, {});
  if (!settings.hooks) settings.hooks = {};

  for (const [eventType, handlers] of Object.entries(hookConfig)) {
    if (!settings.hooks[eventType]) {
      settings.hooks[eventType] = [];
    }

    const handlerArray = Array.isArray(handlers) ? handlers : [handlers];

    for (const handler of handlerArray) {
      const markedHandler = typeof handler === 'object'
        ? { ...handler, _hands: hookName }
        : { command: handler, _hands: hookName };

      const existingIndex = settings.hooks[eventType].findIndex(
        h => h._hands === hookName
      );

      if (existingIndex >= 0) {
        settings.hooks[eventType][existingIndex] = markedHandler;
      } else {
        settings.hooks[eventType].push(markedHandler);
      }
    }
  }

  await writeJsonFile(targetFile, settings);
}

/**
 * Removes all Claude Code handlers for a hook by name
 * @param {string} targetFile - Path to settings.json
 * @param {string} hookName - Hook name to remove
 * @returns {Promise<void>}
 */
async function removeHook(targetFile, hookName) {
  const settings = await readJsonFile(targetFile, {});
  if (!settings.hooks) return;

  for (const eventType of Object.keys(settings.hooks)) {
    if (Array.isArray(settings.hooks[eventType])) {
      settings.hooks[eventType] = settings.hooks[eventType].filter(
        h => h._hands !== hookName
      );
      if (settings.hooks[eventType].length === 0) {
        delete settings.hooks[eventType];
      }
    }
  }

  await writeJsonFile(targetFile, settings);
}

/**
 * Checks if a hook exists in Claude Code settings by its _hands marker
 * @param {string} targetFile - Path to settings.json
 * @param {string} hookName - Hook name to check
 * @returns {Promise<boolean>}
 */
async function hasHook(targetFile, hookName) {
  const hooks = await getHooks(targetFile);
  for (const eventType of Object.keys(hooks)) {
    if (Array.isArray(hooks[eventType])) {
      if (hooks[eventType].some(h => h._hands === hookName)) return true;
    }
  }
  return false;
}

// --- Cursor hook operations ---

/**
 * Gets hooks configuration from Cursor hooks.json
 * @param {string} targetFile - Path to hooks.json
 * @returns {Promise<Object>}
 */
async function getHooksCursor(targetFile = '.cursor/hooks.json') {
  const config = await readJsonFile(targetFile, {});
  return config.hooks ?? {};
}

/**
 * Merges translated Cursor hook config into hooks.json
 * @param {string} targetFile - Path to hooks.json
 * @param {string} hookName - Identifier for tracking
 * @param {Object} hookConfig - Translated Cursor hook format { eventName: [entries] }
 * @returns {Promise<void>}
 */
async function mergeHookCursor(targetFile, hookName, hookConfig) {
  const config = await readJsonFile(targetFile, {});
  if (!config.version) config.version = 1;
  if (!config.hooks) config.hooks = {};

  for (const [eventType, entries] of Object.entries(hookConfig)) {
    if (!config.hooks[eventType]) {
      config.hooks[eventType] = [];
    }

    for (const entry of entries) {
      const markedEntry = { ...entry, _hands: hookName };

      const existingIndex = config.hooks[eventType].findIndex(
        h => h._hands === hookName
      );

      if (existingIndex >= 0) {
        config.hooks[eventType][existingIndex] = markedEntry;
      } else {
        config.hooks[eventType].push(markedEntry);
      }
    }
  }

  await writeJsonFile(targetFile, config);
}

/**
 * Removes all Cursor entries for a hook by name
 * @param {string} targetFile - Path to hooks.json
 * @param {string} hookName - Hook name to remove
 * @returns {Promise<void>}
 */
async function removeHookCursor(targetFile, hookName) {
  const config = await readJsonFile(targetFile, {});
  if (!config.hooks) return;

  for (const eventType of Object.keys(config.hooks)) {
    if (Array.isArray(config.hooks[eventType])) {
      config.hooks[eventType] = config.hooks[eventType].filter(
        h => h._hands !== hookName
      );
      if (config.hooks[eventType].length === 0) {
        delete config.hooks[eventType];
      }
    }
  }

  await writeJsonFile(targetFile, config);
}

/**
 * Checks if a hook exists in Cursor hooks.json by its _hands marker
 * @param {string} targetFile - Path to hooks.json
 * @param {string} hookName - Hook name to check
 * @returns {Promise<boolean>}
 */
async function hasHookCursor(targetFile, hookName) {
  const hooks = await getHooksCursor(targetFile);
  for (const eventType of Object.keys(hooks)) {
    if (Array.isArray(hooks[eventType])) {
      if (hooks[eventType].some(h => h._hands === hookName)) return true;
    }
  }
  return false;
}

// --- Multi-tool hook check ---

/**
 * Checks if a hook is installed in any detected tool
 * @param {string} hookName - Hook name to check
 * @param {string[]} tools - Detected tools (e.g. ['claude', 'cursor'])
 * @returns {Promise<boolean>}
 */
async function hasHookAny(hookName, tools) {
  for (const tool of tools) {
    const targetFile = TOOL_TARGETS[tool];
    if (!targetFile) continue;

    const found = tool === 'cursor'
      ? await hasHookCursor(targetFile, hookName)
      : await hasHook(targetFile, hookName);

    if (found) return true;
  }
  return false;
}

// --- Multi-tool sync ---

/**
 * Syncs hooks across all detected tools: installs selected, removes unselected
 * Translates canonical config to each tool's format via adapters.
 *
 * @param {Object[]} selectedHooks - Hooks the user selected (with canonical config)
 * @param {Object} trackedHooks - Currently tracked hooks from metadata
 * @param {string[]} tools - Detected tools (e.g. ['claude', 'cursor'])
 * @returns {Promise<{added: string[], removed: string[], updated: string[]}>}
 */
async function syncHooks(selectedHooks, trackedHooks, tools) {
  const result = { added: [], removed: [], updated: [] };
  const selectedNames = new Set(selectedHooks.map(h => h.name));

  for (const hook of selectedHooks) {
    const isNew = !(await hasHookAny(hook.name, tools));
    const newHash = tracker.computeHash(hook.config);

    if (isNew) {
      result.added.push(hook.name);
    } else {
      const tracked = trackedHooks[hook.name];
      if (tracked && tracked.hash !== newHash) {
        result.updated.push(hook.name);
      }
    }

    // Install to all detected tools
    for (const tool of tools) {
      const targetFile = TOOL_TARGETS[tool];
      if (!targetFile) continue;

      if (tool === 'cursor') {
        const cursorConfig = toCursor(hook.config);
        await mergeHookCursor(targetFile, hook.name, cursorConfig);
      } else {
        const claudeConfig = toClaudeCode(hook.config);
        await mergeHook(targetFile, hook.name, claudeConfig);
      }
    }

    await tracker.trackInstall(hook, newHash);
  }

  // Remove unselected hooks from all tools
  for (const hookName of Object.keys(trackedHooks)) {
    if (!selectedNames.has(hookName)) {
      for (const tool of tools) {
        const targetFile = TOOL_TARGETS[tool];
        if (!targetFile) continue;

        if (tool === 'cursor') {
          await removeHookCursor(targetFile, hookName);
        } else {
          await removeHook(targetFile, hookName);
        }
      }

      await tracker.trackUninstall({ name: hookName, category: 'hooks' });
      result.removed.push(hookName);
    }
  }

  return result;
}

module.exports = {
  readJsonFile,
  writeJsonFile,
  addMcpServer,
  removeMcpServer,
  getMcpServer,
  getHooks,
  mergeHook,
  removeHook,
  hasHook,
  getHooksCursor,
  mergeHookCursor,
  removeHookCursor,
  hasHookCursor,
  hasHookAny,
  syncHooks
};
