#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const inquirer = require('inquirer');
const chalk = require('chalk');

const { detectComponents, getAllComponents } = require('./lib/detector');
const { addStatusToComponents, formatComponentDisplay, Status } = require('./lib/status');
const { validateComponentEnvVars, formatEnvWarning } = require('./lib/env-validator');
const { syncMcpServers, syncHooks } = require('./lib/merger');
const { trackInstall, computeFileHash } = require('./lib/tracker');

class Hands {
  constructor() {
    this.rulesPath = path.join(__dirname, 'rules');
  }

  async init() {
    try {
      await fs.ensureDir(this.rulesPath);
    } catch (error) {
      console.error(chalk.red('Error accessing rules directory:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Installs a FILE_BASED component
   */
  async installFileComponent(component) {
    const sourcePath = component.sourcePath;
    const targetPath = path.resolve(component.targetPath);

    if (!await fs.pathExists(sourcePath)) {
      console.log(chalk.red(`Source not found: ${sourcePath}`));
      return false;
    }

    const targetExists = await fs.pathExists(targetPath);

    // Backup existing file if different
    if (targetExists) {
      const sourceHash = await computeFileHash(sourcePath);
      const targetHash = await computeFileHash(targetPath);

      if (sourceHash !== targetHash) {
        const backupPath = `${targetPath}.local`;
        await fs.copy(targetPath, backupPath);
        console.log(chalk.yellow(`  Backed up existing file to: ${path.basename(backupPath)}`));
      }
    }

    // Copy file(s)
    await fs.ensureDir(path.dirname(targetPath));

    // Check if source is a directory (for skills)
    const sourceStats = await fs.stat(sourcePath);
    if (sourceStats.isDirectory()) {
      await fs.copy(sourcePath, targetPath);
    } else {
      await fs.copy(sourcePath, targetPath);
    }

    // Track installation
    const hash = await computeFileHash(sourcePath);
    await trackInstall(component, hash);

    console.log(chalk.green(`  Installed: ${component.name}`));
    return true;
  }

  /**
   * Uninstalls a FILE_BASED component
   */
  async uninstallFileComponent(component) {
    const targetPath = path.resolve(component.targetPath);

    if (await fs.pathExists(targetPath)) {
      await fs.remove(targetPath);
      console.log(chalk.yellow(`  Removed: ${component.name}`));
    }

    return true;
  }

  /**
   * Displays the component selection UI
   */
  async displayComponentUI(componentsWithStatus) {
    const categories = [
      { key: 'skills', label: 'Skills', icon: '📦' },
      { key: 'commands', label: 'Commands', icon: '⚡' },
      { key: 'agents', label: 'Agents', icon: '🤖' },
      { key: 'hooks', label: 'Hooks', icon: '🔗' },
      { key: 'mcpServers', label: 'MCP Servers', icon: '🔌' }
    ];

    // Build choices for all categories
    const choices = [];

    for (const cat of categories) {
      const items = componentsWithStatus[cat.key] || [];
      if (items.length === 0) continue;

      // Add category header
      choices.push(new inquirer.Separator(chalk.bold.cyan(`\n${cat.icon} ${cat.label}:`)));

      // Add items
      for (const item of items) {
        const displayName = formatComponentDisplay(item);
        const shouldBeChecked = item.status === Status.INSTALLED || item.status === Status.OUTDATED;

        choices.push({
          name: displayName,
          value: item,
          checked: shouldBeChecked,
          disabled: false
        });
      }
    }

    if (choices.length === 0) {
      console.log(chalk.yellow('\nNo components found in rules directory.'));
      console.log(chalk.dim('Add components to rules/.claude/ to get started.'));
      return [];
    }

    // Show header
    console.log(chalk.bold.blue('\n┌─ Claude Code Components ─────────────────────────┐'));

    const response = await inquirer.prompt({
      type: 'checkbox',
      name: 'selected',
      message: 'Toggle components to install/remove:',
      choices,
      pageSize: 20,
      loop: false
    });

    console.log(chalk.bold.blue('└──────────────────────────────────────────────────┘'));

    return response.selected;
  }

  /**
   * Processes selected components and syncs them
   */
  async syncComponents(selectedComponents, allComponents) {
    const selected = {
      skills: [],
      commands: [],
      agents: [],
      hooks: [],
      mcpServers: []
    };

    // Categorize selected components
    for (const comp of selectedComponents) {
      if (selected[comp.category]) {
        selected[comp.category].push(comp);
      }
    }

    // Track what was installed/removed
    const results = {
      installed: [],
      updated: [],
      removed: []
    };

    // Process FILE_BASED components (skills, commands, agents)
    for (const category of ['skills', 'commands', 'agents']) {
      const selectedNames = new Set(selected[category].map(c => c.name));
      const allInCategory = allComponents[category] || [];

      // Install selected
      for (const comp of selected[category]) {
        if (comp.status === Status.AVAILABLE) {
          await this.installFileComponent(comp);
          results.installed.push(comp.name);
        } else if (comp.status === Status.OUTDATED) {
          await this.installFileComponent(comp);
          results.updated.push(comp.name);
        }
      }

      // Remove unselected that were previously installed
      for (const comp of allInCategory) {
        if (!selectedNames.has(comp.name) &&
            (comp.status === Status.INSTALLED || comp.status === Status.OUTDATED)) {
          await this.uninstallFileComponent(comp);
          results.removed.push(comp.name);
        }
      }
    }

    // Process JSON_ENTRY components (mcpServers)
    if (allComponents.mcpServers && allComponents.mcpServers.length > 0) {
      // Validate env vars for selected servers
      for (const server of selected.mcpServers) {
        const validation = validateComponentEnvVars(server);
        if (!validation.isValid) {
          console.log(formatEnvWarning(validation.missingVars, server.name));
          const proceed = await inquirer.prompt({
            type: 'confirm',
            name: 'proceed',
            message: `Install ${server.name} anyway?`,
            default: false
          });
          if (!proceed.proceed) {
            selected.mcpServers = selected.mcpServers.filter(s => s.name !== server.name);
          }
        }
      }

      const mcpResult = await syncMcpServers(
        '.claude/config.json',
        selected.mcpServers,
        allComponents.mcpServers
      );

      results.installed.push(...mcpResult.added);
      results.updated.push(...mcpResult.updated);
      results.removed.push(...mcpResult.removed);
    }

    // Process JSON_ENTRY components (hooks)
    if (allComponents.hooks && allComponents.hooks.length > 0) {
      // Validate env vars for selected hooks
      for (const hook of selected.hooks) {
        const validation = validateComponentEnvVars(hook);
        if (!validation.isValid) {
          console.log(formatEnvWarning(validation.missingVars, hook.name));
          const proceed = await inquirer.prompt({
            type: 'confirm',
            name: 'proceed',
            message: `Install ${hook.name} anyway?`,
            default: false
          });
          if (!proceed.proceed) {
            selected.hooks = selected.hooks.filter(h => h.name !== hook.name);
          }
        }
      }

      const hookResult = await syncHooks(
        '.claude/settings.json',
        selected.hooks,
        allComponents.hooks
      );

      results.installed.push(...hookResult.added);
      results.updated.push(...hookResult.updated);
      results.removed.push(...hookResult.removed);
    }

    return results;
  }

  /**
   * Main entry point
   */
  async run() {
    await this.init();

    console.log(chalk.bold.green('\n🤲 Hands v2.0\n'));

    // Detect all components
    const components = await detectComponents(this.rulesPath);

    // Check if we have any components
    const allComponents = getAllComponents(components);
    if (allComponents.length === 0) {
      console.log(chalk.yellow('No components found in rules directory.'));
      console.log(chalk.dim('\nExpected structure:'));
      console.log(chalk.dim('  rules/.claude/skills/<name>/SKILL.md'));
      console.log(chalk.dim('  rules/.claude/commands/<name>.md'));
      console.log(chalk.dim('  rules/.claude/mcp-servers/<name>.json'));
      console.log(chalk.dim('  rules/.claude/hooks/<name>.json'));
      return;
    }

    // Add status to all components
    const componentsWithStatus = await addStatusToComponents(components);

    // Display UI and get selection
    const selectedComponents = await this.displayComponentUI(componentsWithStatus);

    // Sync selected components
    console.log(chalk.bold.blue('\nSyncing components...\n'));

    const results = await this.syncComponents(selectedComponents, componentsWithStatus);

    // Summary
    console.log('');
    if (results.installed.length > 0) {
      console.log(chalk.green(`✓ Installed: ${results.installed.join(', ')}`));
    }
    if (results.updated.length > 0) {
      console.log(chalk.yellow(`↻ Updated: ${results.updated.join(', ')}`));
    }
    if (results.removed.length > 0) {
      console.log(chalk.red(`✗ Removed: ${results.removed.join(', ')}`));
    }

    if (results.installed.length === 0 &&
        results.updated.length === 0 &&
        results.removed.length === 0) {
      console.log(chalk.dim('No changes made.'));
    }

    console.log(chalk.bold.green('\nDone!'));
  }
}

// Run the CLI
if (require.main === module) {
  const hands = new Hands();
  hands.run().catch(error => {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  });
}

module.exports = Hands;
