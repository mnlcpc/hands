/**
 * Adapter layer for translating canonical hook format to tool-specific formats.
 *
 * Canonical format (in hands/hooks/*.json):
 *   { "stop": [{ "matcher": "*", "command": "..." }] }
 *
 * Claude Code format (.claude/settings.json → hooks):
 *   { "Stop": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "..." }] }] }
 *
 * Cursor format (.cursor/hooks.json → hooks):
 *   { "stop": [{ "command": "...", "matcher": "*" }] }
 *
 * Note: _hands markers are NOT added here — merger functions handle tracking markers.
 */

const fs = require('fs-extra');
const path = require('path');

/**
 * Mapping from canonical event names (camelCase) to tool-specific event names.
 * null means the event is not supported by that tool and should be skipped.
 */
const EVENT_MAP = {
  stop:           { claude: 'Stop',           cursor: 'stop' },
  preToolUse:     { claude: 'PreToolUse',     cursor: 'preToolUse' },
  postToolUse:    { claude: 'PostToolUse',    cursor: 'postToolUse' },
  notification:   { claude: 'Notification',   cursor: null },
  subagentStop:   { claude: 'SubagentStop',   cursor: 'subagentStop' },
  sessionStart:   { claude: 'SessionStart',   cursor: 'sessionStart' },
  sessionEnd:     { claude: 'SessionEnd',     cursor: 'sessionEnd' }
};

/**
 * Target file paths for each tool's hook configuration
 */
const TOOL_TARGETS = {
  claude: path.join('.claude', 'settings.json'),
  cursor: path.join('.cursor', 'hooks.json')
};

/**
 * Translates canonical hook config to Claude Code format.
 * Groups entries by matcher into the nested { matcher, hooks: [...] } structure.
 *
 * @param {Object} canonicalConfig - Canonical hook config
 * @returns {Object} - Claude Code hook format (event → matcher objects)
 */
function toClaudeCode(canonicalConfig) {
  const result = {};

  for (const [event, entries] of Object.entries(canonicalConfig)) {
    const mapped = EVENT_MAP[event]?.claude;
    if (!mapped) continue;

    // Group entries by matcher
    const matcherGroups = {};
    for (const entry of entries) {
      const matcher = entry.matcher || '*';
      if (!matcherGroups[matcher]) matcherGroups[matcher] = [];
      matcherGroups[matcher].push({
        type: 'command',
        command: entry.command
      });
    }

    result[mapped] = Object.entries(matcherGroups).map(([matcher, hooks]) => ({
      matcher,
      hooks
    }));
  }

  return result;
}

/**
 * Translates canonical hook config to Cursor format.
 * Flat entries with command and optional matcher.
 *
 * @param {Object} canonicalConfig - Canonical hook config
 * @returns {Object} - Cursor hook format (event → flat entries)
 */
function toCursor(canonicalConfig) {
  const result = {};

  for (const [event, entries] of Object.entries(canonicalConfig)) {
    const mapped = EVENT_MAP[event]?.cursor;
    if (!mapped) continue;

    result[mapped] = entries.map(entry => {
      const translated = { command: entry.command };
      if (entry.matcher && entry.matcher !== '*') {
        translated.matcher = entry.matcher;
      }
      return translated;
    });
  }

  return result;
}

/**
 * Detects which AI coding tools are present in the target project
 * by checking for their configuration directories.
 *
 * @param {string} [projectRoot='.'] - Project root directory
 * @returns {Promise<string[]>} - Array of detected tool names (e.g. ['claude', 'cursor'])
 */
async function detectTools(projectRoot = '.') {
  const tools = [];

  if (await fs.pathExists(path.join(projectRoot, '.claude'))) {
    tools.push('claude');
  }

  if (await fs.pathExists(path.join(projectRoot, '.cursor'))) {
    tools.push('cursor');
  }

  return tools;
}

module.exports = {
  EVENT_MAP,
  TOOL_TARGETS,
  toClaudeCode,
  toCursor,
  detectTools
};
