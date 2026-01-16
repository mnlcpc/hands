const chalk = require('chalk');

// Regex to match ${VAR_NAME} patterns
const ENV_VAR_PATTERN = /\$\{([A-Z_][A-Z0-9_]*)\}/g;

/**
 * Extracts environment variable names from a string or object
 * @param {any} content - Content to scan (string, object, or array)
 * @returns {string[]} - Array of unique environment variable names
 */
function extractEnvVars(content) {
  const vars = new Set();

  function scan(value) {
    if (typeof value === 'string') {
      let match;
      while ((match = ENV_VAR_PATTERN.exec(value)) !== null) {
        vars.add(match[1]);
      }
      // Reset regex lastIndex for next use
      ENV_VAR_PATTERN.lastIndex = 0;
    } else if (Array.isArray(value)) {
      value.forEach(scan);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(scan);
    }
  }

  scan(content);
  return Array.from(vars);
}

/**
 * Validates that environment variables are set
 * @param {string[]} vars - Array of variable names to check
 * @returns {Object} - { valid: string[], missing: string[] }
 */
function validateEnvVars(vars) {
  const valid = [];
  const missing = [];

  for (const varName of vars) {
    if (process.env[varName]) {
      valid.push(varName);
    } else {
      missing.push(varName);
    }
  }

  return { valid, missing };
}

/**
 * Validates env vars for a component
 * @param {Object} component - Component with config property
 * @returns {Object} - { requiredVars: string[], missingVars: string[], isValid: boolean }
 */
function validateComponentEnvVars(component) {
  const requiredVars = extractEnvVars(component.config);
  const { valid, missing } = validateEnvVars(requiredVars);

  return {
    requiredVars,
    missingVars: missing,
    validVars: valid,
    isValid: missing.length === 0
  };
}

/**
 * Formats a warning message for missing environment variables
 * @param {string[]} missingVars - Array of missing variable names
 * @param {string} componentName - Name of the component
 * @returns {string} - Formatted warning string
 */
function formatEnvWarning(missingVars, componentName) {
  if (missingVars.length === 0) {
    return '';
  }

  const lines = [
    chalk.yellow(`\n  Required environment variables for ${componentName}:`),
  ];

  for (const varName of missingVars) {
    lines.push(chalk.red(`     ${varName} - not found in environment`));
  }

  lines.push('');
  lines.push(chalk.dim('     Add to your shell profile (~/.zshrc or ~/.bashrc):'));

  for (const varName of missingVars) {
    lines.push(chalk.dim(`     export ${varName}="your_value_here"`));
  }

  return lines.join('\n');
}

/**
 * Prompts user about missing env vars and returns whether to proceed
 * @param {string[]} missingVars - Array of missing variable names
 * @param {string} componentName - Name of the component
 * @param {Function} promptFn - inquirer prompt function
 * @returns {Promise<boolean>} - Whether to proceed with installation
 */
async function promptForMissingEnvVars(missingVars, componentName, promptFn) {
  if (missingVars.length === 0) {
    return true;
  }

  console.log(formatEnvWarning(missingVars, componentName));

  const response = await promptFn({
    type: 'confirm',
    name: 'proceed',
    message: 'Install anyway?',
    default: false
  });

  return response.proceed;
}

module.exports = {
  extractEnvVars,
  validateEnvVars,
  validateComponentEnvVars,
  formatEnvWarning,
  promptForMissingEnvVars
};
