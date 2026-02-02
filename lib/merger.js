const fs = require('fs-extra');
const path = require('path');
const tracker = require('./tracker');

/**
 * Reads a JSON file, returning default structure if it doesn't exist
 * @param {string} filePath - Path to JSON file
 * @param {Object} defaultValue - Default value if file doesn't exist
 * @returns {Promise<Object>} - Parsed JSON content
 */
async function readJsonFile(filePath, defaultValue = {}) {
  const resolvedPath = path.resolve(filePath);

  try {
    if (await fs.pathExists(resolvedPath)) {
      return await fs.readJson(resolvedPath);
    }
  } catch (e) {
    // If file is corrupted, return default
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

/**
 * Gets the MCP servers configuration from config.json
 * @param {string} targetFile - Path to config.json (default: .claude/config.json)
 * @returns {Promise<Object>} - mcpServers object
 */
async function getMcpServers(targetFile = '.claude/config.json') {
  const config = await readJsonFile(targetFile, {});
  return config.mcpServers || {};
}

/**
 * Sets MCP servers in config.json, preserving other config
 * @param {string} targetFile - Path to config.json
 * @param {Object} mcpServers - MCP servers object to set
 * @returns {Promise<void>}
 */
async function setMcpServers(targetFile, mcpServers) {
  const config = await readJsonFile(targetFile, {});
  config.mcpServers = mcpServers;
  await writeJsonFile(targetFile, config);
}

/**
 * Adds or updates an MCP server
 * @param {string} targetFile - Path to config.json
 * @param {string} serverName - Name of the server
 * @param {Object} serverConfig - Server configuration
 * @returns {Promise<void>}
 */
async function addMcpServer(targetFile, serverName, serverConfig) {
  const servers = await getMcpServers(targetFile);
  servers[serverName] = serverConfig;
  await setMcpServers(targetFile, servers);
}

/**
 * Removes an MCP server
 * @param {string} targetFile - Path to config.json
 * @param {string} serverName - Name of the server to remove
 * @returns {Promise<void>}
 */
async function removeMcpServer(targetFile, serverName) {
  const servers = await getMcpServers(targetFile);
  delete servers[serverName];
  await setMcpServers(targetFile, servers);
}

/**
 * Checks if an MCP server exists
 * @param {string} targetFile - Path to config.json
 * @param {string} serverName - Name of the server
 * @returns {Promise<boolean>}
 */
async function hasMcpServer(targetFile, serverName) {
  const servers = await getMcpServers(targetFile);
  return serverName in servers;
}

/**
 * Gets a specific MCP server config
 * @param {string} targetFile - Path to config.json
 * @param {string} serverName - Name of the server
 * @returns {Promise<Object|null>}
 */
async function getMcpServer(targetFile, serverName) {
  const servers = await getMcpServers(targetFile);
  return servers[serverName] || null;
}

/**
 * Gets the hooks configuration from settings.json
 * @param {string} targetFile - Path to settings.json (default: .claude/settings.json)
 * @returns {Promise<Object>} - hooks object
 */
async function getHooks(targetFile = '.claude/settings.json') {
  const settings = await readJsonFile(targetFile, {});
  return settings.hooks || {};
}

/**
 * Sets hooks in settings.json, preserving other settings
 * @param {string} targetFile - Path to settings.json
 * @param {Object} hooks - Hooks object to set
 * @returns {Promise<void>}
 */
async function setHooks(targetFile, hooks) {
  const settings = await readJsonFile(targetFile, {});
  settings.hooks = hooks;
  await writeJsonFile(targetFile, settings);
}

/**
 * Merges hook config into existing hooks
 * Hooks have event-based structure: { eventName: [handlers] }
 * @param {string} targetFile - Path to settings.json
 * @param {string} hookName - Identifier for this hook (for tracking)
 * @param {Object} hookConfig - Hook configuration to merge
 * @returns {Promise<void>}
 */
async function mergeHook(targetFile, hookName, hookConfig) {
  const settings = await readJsonFile(targetFile, {});

  if (!settings.hooks) {
    settings.hooks = {};
  }

  // Hook config can have multiple event types (PreToolUse, PostToolUse, etc.)
  // Each event type can be a single handler or array of handlers
  for (const [eventType, handlers] of Object.entries(hookConfig)) {
    if (!settings.hooks[eventType]) {
      settings.hooks[eventType] = [];
    }

    // Ensure handlers is always an array
    const handlerArray = Array.isArray(handlers) ? handlers : [handlers];

    for (const handler of handlerArray) {
      // Add marker to track which hooks came from hands
      const markedHandler = typeof handler === 'object'
        ? { ...handler, _hands: hookName }
        : { command: handler, _hands: hookName };

      // Check if this handler already exists (by _hands marker)
      const existingIndex = settings.hooks[eventType].findIndex(
        h => h._hands === hookName
      );

      if (existingIndex >= 0) {
        // Update existing
        settings.hooks[eventType][existingIndex] = markedHandler;
      } else {
        // Add new
        settings.hooks[eventType].push(markedHandler);
      }
    }
  }

  await writeJsonFile(targetFile, settings);
}

/**
 * Removes hooks by name (removes all handlers with matching _hands marker)
 * @param {string} targetFile - Path to settings.json
 * @param {string} hookName - Hook name to remove
 * @returns {Promise<void>}
 */
async function removeHook(targetFile, hookName) {
  const settings = await readJsonFile(targetFile, {});

  if (!settings.hooks) {
    return;
  }

  for (const eventType of Object.keys(settings.hooks)) {
    if (Array.isArray(settings.hooks[eventType])) {
      settings.hooks[eventType] = settings.hooks[eventType].filter(
        h => h._hands !== hookName
      );

      // Remove empty arrays
      if (settings.hooks[eventType].length === 0) {
        delete settings.hooks[eventType];
      }
    }
  }

  await writeJsonFile(targetFile, settings);
}

/**
 * Checks if a hook exists (by name marker)
 * @param {string} targetFile - Path to settings.json
 * @param {string} hookName - Hook name to check
 * @returns {Promise<boolean>}
 */
async function hasHook(targetFile, hookName) {
  const hooks = await getHooks(targetFile);

  for (const eventType of Object.keys(hooks)) {
    if (Array.isArray(hooks[eventType])) {
      const found = hooks[eventType].some(h => h._hands === hookName);
      if (found) return true;
    }
  }

  return false;
}

/**
 * Syncs MCP servers: adds selected, removes unselected (that came from hands)
 * @param {string} targetFile - Path to config.json
 * @param {Object[]} selectedServers - Array of selected server components
 * @param {Object[]} allServers - Array of all available server components
 * @returns {Promise<{added: string[], removed: string[], updated: string[]}>}
 */
async function syncMcpServers(targetFile, selectedServers, allServers) {
  const result = { added: [], removed: [], updated: [] };
  const trackedServers = await tracker.getTrackedComponents('mcpServers');
  const currentServers = await getMcpServers(targetFile);
  const selectedNames = new Set(selectedServers.map(s => s.name));

  // Add/update selected servers
  for (const server of selectedServers) {
    const currentConfig = currentServers[server.name];
    const newHash = tracker.computeHash(server.config);

    if (!currentConfig) {
      result.added.push(server.name);
    } else {
      const oldHash = tracker.computeHash(currentConfig);
      if (oldHash !== newHash) {
        result.updated.push(server.name);
      }
    }

    await addMcpServer(targetFile, server.name, server.config);
    await tracker.trackInstall(server, newHash);
  }

  // Remove unselected servers that were installed by hands
  for (const serverName of Object.keys(trackedServers)) {
    if (!selectedNames.has(serverName)) {
      await removeMcpServer(targetFile, serverName);
      await tracker.trackUninstall({ name: serverName, category: 'mcpServers' });
      result.removed.push(serverName);
    }
  }

  return result;
}

/**
 * Syncs hooks: adds selected, removes unselected (that came from hands)
 * @param {string} targetFile - Path to settings.json
 * @param {Object[]} selectedHooks - Array of selected hook components
 * @param {Object[]} allHooks - Array of all available hook components
 * @returns {Promise<{added: string[], removed: string[], updated: string[]}>}
 */
async function syncHooks(targetFile, selectedHooks, allHooks) {
  const result = { added: [], removed: [], updated: [] };
  const trackedHooks = await tracker.getTrackedComponents('hooks');
  const selectedNames = new Set(selectedHooks.map(h => h.name));

  // Add/update selected hooks
  for (const hook of selectedHooks) {
    const isNew = !(await hasHook(targetFile, hook.name));
    const newHash = tracker.computeHash(hook.config);

    if (isNew) {
      result.added.push(hook.name);
    } else {
      const trackedInfo = trackedHooks[hook.name];
      if (trackedInfo && trackedInfo.hash !== newHash) {
        result.updated.push(hook.name);
      }
    }

    await mergeHook(targetFile, hook.name, hook.config);
    await tracker.trackInstall(hook, newHash);
  }

  // Remove unselected hooks that were installed by hands
  for (const hookName of Object.keys(trackedHooks)) {
    if (!selectedNames.has(hookName)) {
      await removeHook(targetFile, hookName);
      await tracker.trackUninstall({ name: hookName, category: 'hooks' });
      result.removed.push(hookName);
    }
  }

  return result;
}

module.exports = {
  readJsonFile,
  writeJsonFile,
  getMcpServers,
  setMcpServers,
  addMcpServer,
  removeMcpServer,
  hasMcpServer,
  getMcpServer,
  getHooks,
  setHooks,
  mergeHook,
  removeHook,
  hasHook,
  syncMcpServers,
  syncHooks
};
