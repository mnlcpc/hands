const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

const METADATA_FILE = '.rules4code-meta.json';
const VERSION = '2.0.0';

/**
 * Gets the path to the metadata file
 * @param {string} targetDir - Target directory (usually .claude)
 * @returns {string} - Full path to metadata file
 */
function getMetadataPath(targetDir = '.claude') {
  return path.resolve(targetDir, METADATA_FILE);
}

/**
 * Creates an empty metadata structure
 * @returns {Object} - Empty metadata object
 */
function createEmptyMetadata() {
  return {
    version: VERSION,
    installedBy: 'rules4code',
    components: {
      skills: {},
      commands: {},
      mcpServers: {},
      hooks: {},
      agents: {}
    }
  };
}

/**
 * Reads the metadata file
 * @param {string} targetDir - Target directory
 * @returns {Promise<Object>} - Metadata object
 */
async function readMetadata(targetDir = '.claude') {
  const metaPath = getMetadataPath(targetDir);

  try {
    if (await fs.pathExists(metaPath)) {
      const data = await fs.readJson(metaPath);
      // Ensure all required fields exist
      return {
        ...createEmptyMetadata(),
        ...data,
        components: {
          ...createEmptyMetadata().components,
          ...(data.components || {})
        }
      };
    }
  } catch (e) {
    // If file is corrupted, return empty metadata
  }

  return createEmptyMetadata();
}

/**
 * Writes the metadata file
 * @param {Object} metadata - Metadata to write
 * @param {string} targetDir - Target directory
 * @returns {Promise<void>}
 */
async function writeMetadata(metadata, targetDir = '.claude') {
  const metaPath = getMetadataPath(targetDir);
  await fs.ensureDir(path.dirname(metaPath));
  await fs.writeJson(metaPath, metadata, { spaces: 2 });
}

/**
 * Computes a hash for a component's content
 * @param {any} content - Content to hash (can be string, object, or file path)
 * @returns {string} - MD5 hash
 */
function computeHash(content) {
  const data = typeof content === 'string' ? content : JSON.stringify(content);
  return crypto.createHash('md5').update(data).digest('hex');
}

/**
 * Computes hash for a file
 * @param {string} filePath - Path to file
 * @returns {Promise<string|null>} - MD5 hash or null if file doesn't exist
 */
async function computeFileHash(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return computeHash(content);
  } catch {
    return null;
  }
}

/**
 * Records a component as installed
 * @param {Object} component - Component object
 * @param {string} hash - Content hash
 * @param {string} targetDir - Target directory
 * @returns {Promise<void>}
 */
async function trackInstall(component, hash, targetDir = '.claude') {
  const metadata = await readMetadata(targetDir);
  const categoryKey = getCategoryKey(component.category);

  metadata.components[categoryKey][component.name] = {
    hash,
    installedAt: new Date().toISOString(),
    sourcePath: component.sourcePath
  };

  await writeMetadata(metadata, targetDir);
}

/**
 * Records a component as uninstalled
 * @param {Object} component - Component object
 * @param {string} targetDir - Target directory
 * @returns {Promise<void>}
 */
async function trackUninstall(component, targetDir = '.claude') {
  const metadata = await readMetadata(targetDir);
  const categoryKey = getCategoryKey(component.category);

  delete metadata.components[categoryKey][component.name];

  await writeMetadata(metadata, targetDir);
}

/**
 * Gets the tracked info for a component
 * @param {Object} component - Component object
 * @param {string} targetDir - Target directory
 * @returns {Promise<Object|null>} - Tracked info or null if not tracked
 */
async function getTrackedInfo(component, targetDir = '.claude') {
  const metadata = await readMetadata(targetDir);
  const categoryKey = getCategoryKey(component.category);

  return metadata.components[categoryKey][component.name] || null;
}

/**
 * Gets all tracked components for a category
 * @param {string} category - Category name
 * @param {string} targetDir - Target directory
 * @returns {Promise<Object>} - Object with component names as keys
 */
async function getTrackedComponents(category, targetDir = '.claude') {
  const metadata = await readMetadata(targetDir);
  const categoryKey = getCategoryKey(category);

  return metadata.components[categoryKey] || {};
}

/**
 * Checks if a component is tracked
 * @param {Object} component - Component object
 * @param {string} targetDir - Target directory
 * @returns {Promise<boolean>}
 */
async function isTracked(component, targetDir = '.claude') {
  const info = await getTrackedInfo(component, targetDir);
  return info !== null;
}

/**
 * Maps category constant to metadata key
 * @param {string} category - Category constant
 * @returns {string} - Metadata key
 */
function getCategoryKey(category) {
  const mapping = {
    skills: 'skills',
    commands: 'commands',
    mcpServers: 'mcpServers',
    hooks: 'hooks',
    agents: 'agents'
  };
  return mapping[category] || category;
}

module.exports = {
  readMetadata,
  writeMetadata,
  trackInstall,
  trackUninstall,
  getTrackedInfo,
  getTrackedComponents,
  isTracked,
  computeHash,
  computeFileHash,
  getMetadataPath,
  METADATA_FILE,
  VERSION
};
