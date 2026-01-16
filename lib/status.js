const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { ComponentType } = require('./detector');
const tracker = require('./tracker');
const merger = require('./merger');
const envValidator = require('./env-validator');

// Status constants
const Status = {
  INSTALLED: 'installed',
  OUTDATED: 'outdated',
  AVAILABLE: 'available',
  MISSING_ENV: 'missing-env'
};

// Status symbols with colors
const StatusSymbol = {
  [Status.INSTALLED]: chalk.green('[✓]'),
  [Status.OUTDATED]: chalk.yellow('[~]'),
  [Status.AVAILABLE]: chalk.dim('[ ]'),
  [Status.MISSING_ENV]: chalk.red('⚠️ ')
};

// Status descriptions
const StatusDescription = {
  [Status.INSTALLED]: chalk.dim('(installed)'),
  [Status.OUTDATED]: chalk.yellow('(outdated)'),
  [Status.AVAILABLE]: chalk.dim('(available)'),
  [Status.MISSING_ENV]: (vars) => chalk.red(`(missing: ${vars.join(', ')})`)
};

/**
 * Gets the installation status of a FILE_BASED component
 * @param {Object} component - Component object
 * @returns {Promise<Object>} - { status, symbol, description }
 */
async function getFileBasedStatus(component) {
  const targetPath = path.resolve(component.targetPath);
  const sourcePath = component.sourcePath;

  // Check if target exists
  const targetExists = await fs.pathExists(targetPath);

  if (!targetExists) {
    return {
      status: Status.AVAILABLE,
      symbol: StatusSymbol[Status.AVAILABLE],
      description: StatusDescription[Status.AVAILABLE]
    };
  }

  // Compare hashes
  const sourceHash = await tracker.computeFileHash(sourcePath);
  const targetHash = await tracker.computeFileHash(targetPath);

  if (sourceHash === targetHash) {
    return {
      status: Status.INSTALLED,
      symbol: StatusSymbol[Status.INSTALLED],
      description: StatusDescription[Status.INSTALLED]
    };
  }

  // Check if it's tracked - if tracked, it's outdated; if not, it's a conflict
  const trackedInfo = await tracker.getTrackedInfo(component);

  if (trackedInfo) {
    return {
      status: Status.OUTDATED,
      symbol: StatusSymbol[Status.OUTDATED],
      description: StatusDescription[Status.OUTDATED]
    };
  }

  // Exists but not tracked - treat as outdated (will backup on install)
  return {
    status: Status.OUTDATED,
    symbol: StatusSymbol[Status.OUTDATED],
    description: chalk.yellow('(different)')
  };
}

/**
 * Gets the installation status of a JSON_ENTRY component (MCP server)
 * @param {Object} component - Component object
 * @returns {Promise<Object>} - { status, symbol, description, missingEnvVars }
 */
async function getMcpServerStatus(component) {
  // First check env vars
  const envValidation = envValidator.validateComponentEnvVars(component);

  if (!envValidation.isValid) {
    return {
      status: Status.MISSING_ENV,
      symbol: StatusSymbol[Status.MISSING_ENV],
      description: StatusDescription[Status.MISSING_ENV](envValidation.missingVars),
      missingEnvVars: envValidation.missingVars
    };
  }

  // Check if server exists in config
  const targetFile = component.targetFile;
  const currentConfig = await merger.getMcpServer(targetFile, component.name);

  if (!currentConfig) {
    return {
      status: Status.AVAILABLE,
      symbol: StatusSymbol[Status.AVAILABLE],
      description: StatusDescription[Status.AVAILABLE]
    };
  }

  // Compare configs
  const sourceHash = tracker.computeHash(component.config);
  const targetHash = tracker.computeHash(currentConfig);

  if (sourceHash === targetHash) {
    return {
      status: Status.INSTALLED,
      symbol: StatusSymbol[Status.INSTALLED],
      description: StatusDescription[Status.INSTALLED]
    };
  }

  return {
    status: Status.OUTDATED,
    symbol: StatusSymbol[Status.OUTDATED],
    description: StatusDescription[Status.OUTDATED]
  };
}

/**
 * Gets the installation status of a JSON_ENTRY component (hook)
 * @param {Object} component - Component object
 * @returns {Promise<Object>} - { status, symbol, description, missingEnvVars }
 */
async function getHookStatus(component) {
  // First check env vars
  const envValidation = envValidator.validateComponentEnvVars(component);

  if (!envValidation.isValid) {
    return {
      status: Status.MISSING_ENV,
      symbol: StatusSymbol[Status.MISSING_ENV],
      description: StatusDescription[Status.MISSING_ENV](envValidation.missingVars),
      missingEnvVars: envValidation.missingVars
    };
  }

  // Check if hook exists
  const targetFile = component.targetFile;
  const exists = await merger.hasHook(targetFile, component.name);

  if (!exists) {
    return {
      status: Status.AVAILABLE,
      symbol: StatusSymbol[Status.AVAILABLE],
      description: StatusDescription[Status.AVAILABLE]
    };
  }

  // Check if outdated by comparing tracked hash
  const trackedInfo = await tracker.getTrackedInfo(component);
  const currentHash = tracker.computeHash(component.config);

  if (trackedInfo && trackedInfo.hash === currentHash) {
    return {
      status: Status.INSTALLED,
      symbol: StatusSymbol[Status.INSTALLED],
      description: StatusDescription[Status.INSTALLED]
    };
  }

  return {
    status: Status.OUTDATED,
    symbol: StatusSymbol[Status.OUTDATED],
    description: StatusDescription[Status.OUTDATED]
  };
}

/**
 * Gets the installation status of any component
 * @param {Object} component - Component object
 * @returns {Promise<Object>} - { status, symbol, description, missingEnvVars? }
 */
async function getComponentStatus(component) {
  if (component.type === ComponentType.FILE_BASED) {
    return getFileBasedStatus(component);
  }

  if (component.category === 'mcpServers') {
    return getMcpServerStatus(component);
  }

  if (component.category === 'hooks') {
    return getHookStatus(component);
  }

  // Default to file-based logic
  return getFileBasedStatus(component);
}

/**
 * Adds status info to all components
 * @param {Object} components - Components object from detector
 * @returns {Promise<Object>} - Components with status added
 */
async function addStatusToComponents(components) {
  const result = {};

  for (const [category, items] of Object.entries(components)) {
    result[category] = [];

    for (const component of items) {
      const statusInfo = await getComponentStatus(component);
      result[category].push({
        ...component,
        ...statusInfo
      });
    }
  }

  return result;
}

/**
 * Formats a component for display in the list
 * @param {Object} component - Component with status
 * @returns {string} - Formatted string
 */
function formatComponentDisplay(component) {
  const name = chalk.white(component.name.padEnd(20));
  return `${component.symbol} ${name} ${component.description}`;
}

module.exports = {
  getComponentStatus,
  getFileBasedStatus,
  getMcpServerStatus,
  getHookStatus,
  addStatusToComponents,
  formatComponentDisplay,
  Status,
  StatusSymbol,
  StatusDescription
};
