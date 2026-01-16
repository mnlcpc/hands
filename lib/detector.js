const fs = require('fs-extra');
const path = require('path');

// Component type constants
const ComponentType = {
  FILE_BASED: 'FILE_BASED',
  JSON_ENTRY: 'JSON_ENTRY'
};

// Component category constants
const Category = {
  SKILLS: 'skills',
  COMMANDS: 'commands',
  MCP_SERVERS: 'mcpServers',
  HOOKS: 'hooks',
  AGENTS: 'agents'
};

/**
 * Detects all components in the rules directory
 * @param {string} rulesPath - Path to the rules directory
 * @returns {Promise<Object>} - Object containing arrays of components by category
 */
async function detectComponents(rulesPath) {
  const components = {
    skills: [],
    commands: [],
    mcpServers: [],
    hooks: [],
    agents: []
  };

  const claudeRulesPath = path.join(rulesPath, '.claude');

  if (!await fs.pathExists(claudeRulesPath)) {
    return components;
  }

  // Detect skills: rules/.claude/skills/*/SKILL.md
  const skillsPath = path.join(claudeRulesPath, 'skills');
  if (await fs.pathExists(skillsPath)) {
    const skillDirs = await fs.readdir(skillsPath, { withFileTypes: true });
    for (const dir of skillDirs) {
      if (dir.isDirectory()) {
        const skillFile = path.join(skillsPath, dir.name, 'SKILL.md');
        if (await fs.pathExists(skillFile)) {
          components.skills.push({
            name: dir.name,
            type: ComponentType.FILE_BASED,
            category: Category.SKILLS,
            sourcePath: path.join(skillsPath, dir.name),
            targetPath: path.join('.claude', 'skills', dir.name),
            files: await getDirectoryFiles(path.join(skillsPath, dir.name))
          });
        }
      }
    }
  }

  // Detect commands: rules/.claude/commands/*.md
  const commandsPath = path.join(claudeRulesPath, 'commands');
  if (await fs.pathExists(commandsPath)) {
    const commandFiles = await fs.readdir(commandsPath, { withFileTypes: true });
    for (const file of commandFiles) {
      if (file.isFile() && file.name.endsWith('.md')) {
        const name = path.basename(file.name, '.md');
        components.commands.push({
          name,
          type: ComponentType.FILE_BASED,
          category: Category.COMMANDS,
          sourcePath: path.join(commandsPath, file.name),
          targetPath: path.join('.claude', 'commands', file.name)
        });
      }
    }
  }

  // Detect MCP servers: rules/.claude/mcp-servers/*.json
  const mcpServersPath = path.join(claudeRulesPath, 'mcp-servers');
  if (await fs.pathExists(mcpServersPath)) {
    const serverFiles = await fs.readdir(mcpServersPath, { withFileTypes: true });
    for (const file of serverFiles) {
      if (file.isFile() && file.name.endsWith('.json')) {
        const name = path.basename(file.name, '.json');
        const sourcePath = path.join(mcpServersPath, file.name);
        let config = {};
        try {
          config = await fs.readJson(sourcePath);
        } catch (e) {
          // Invalid JSON, skip
          continue;
        }
        components.mcpServers.push({
          name,
          type: ComponentType.JSON_ENTRY,
          category: Category.MCP_SERVERS,
          sourcePath,
          targetFile: path.join('.claude', 'config.json'),
          targetKey: 'mcpServers',
          config
        });
      }
    }
  }

  // Detect hooks: rules/.claude/hooks/*.json
  const hooksPath = path.join(claudeRulesPath, 'hooks');
  if (await fs.pathExists(hooksPath)) {
    const hookFiles = await fs.readdir(hooksPath, { withFileTypes: true });
    for (const file of hookFiles) {
      if (file.isFile() && file.name.endsWith('.json')) {
        const name = path.basename(file.name, '.json');
        const sourcePath = path.join(hooksPath, file.name);
        let config = {};
        try {
          config = await fs.readJson(sourcePath);
        } catch (e) {
          // Invalid JSON, skip
          continue;
        }
        components.hooks.push({
          name,
          type: ComponentType.JSON_ENTRY,
          category: Category.HOOKS,
          sourcePath,
          targetFile: path.join('.claude', 'settings.json'),
          targetKey: 'hooks',
          config
        });
      }
    }
  }

  // Detect agents: rules/.claude/agents/*.md
  const agentsPath = path.join(claudeRulesPath, 'agents');
  if (await fs.pathExists(agentsPath)) {
    const agentFiles = await fs.readdir(agentsPath, { withFileTypes: true });
    for (const file of agentFiles) {
      if (file.isFile() && file.name.endsWith('.md')) {
        const name = path.basename(file.name, '.md');
        components.agents.push({
          name,
          type: ComponentType.FILE_BASED,
          category: Category.AGENTS,
          sourcePath: path.join(agentsPath, file.name),
          targetPath: path.join('.claude', 'agents', file.name)
        });
      }
    }
  }

  return components;
}

/**
 * Gets all files in a directory recursively
 * @param {string} dirPath - Directory path
 * @returns {Promise<string[]>} - Array of relative file paths
 */
async function getDirectoryFiles(dirPath) {
  const files = [];

  async function scan(currentPath, relativePath = '') {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relPath = path.join(relativePath, entry.name);
      if (entry.isDirectory()) {
        await scan(fullPath, relPath);
      } else {
        files.push(relPath);
      }
    }
  }

  await scan(dirPath);
  return files;
}

/**
 * Gets a flat list of all components
 * @param {Object} components - Components object from detectComponents
 * @returns {Array} - Flat array of all components
 */
function getAllComponents(components) {
  return [
    ...components.skills,
    ...components.commands,
    ...components.mcpServers,
    ...components.hooks,
    ...components.agents
  ];
}

module.exports = {
  detectComponents,
  getAllComponents,
  ComponentType,
  Category
};
