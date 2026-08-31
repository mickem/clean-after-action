import * as core from '@actions/core';
import * as io from '@actions/io';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// Values which are treated as "off" for a boolean input. Anything else (including
// the input being set to any other text) is treated as "on".
const FALSE_VALUES = ['false', '0', '', 'no', 'n', 'off'];

/**
 * Reads a boolean action input.
 *
 * @param {string} name name of the input as declared in action.yml
 * @returns {boolean} true unless the input is unset or one of FALSE_VALUES
 */
export function getBoolInput(name) {
  return !FALSE_VALUES.includes(core.getInput(name).trim().toLowerCase());
}

/**
 * Deletes everything inside a directory.
 *
 * @param {object} [options]
 * @param {string} [options.directory] directory to clean, defaults to the workspace (cwd)
 * @param {boolean} [options.keepGit] when true the `.git` folder is left alone
 * @param {(message: string) => void} [options.log] logger, injectable for tests
 * @param {(target: string) => Promise<void>} [options.remove] delete function, injectable for tests
 * @returns {Promise<string[]>} the entries which were deleted
 */
export async function cleanWorkspace({
  directory = '.',
  keepGit = false,
  log = core.info,
  remove = io.rmRF,
} = {}) {
  const entries = await fs.readdir(directory);
  const deleted = [];
  for (const entry of entries) {
    if (keepGit && entry === '.git') {
      log('Keeping .git');
      continue;
    }
    log(`Deleting ${entry}`);
    await remove(path.join(directory, entry));
    deleted.push(entry);
  }
  return deleted;
}

/**
 * Entry point for the post (cleanup) step of the action: reads the inputs, cleans the
 * workspace and marks the step as failed if anything goes wrong.
 *
 * @param {object} [options] overrides forwarded to cleanWorkspace, used by the tests
 * @returns {Promise<void>}
 */
export async function run(options = {}) {
  try {
    const keepGit = getBoolInput('keepGit');
    const deleted = await cleanWorkspace({ keepGit, ...options });
    core.info(`Finished, deleted ${deleted.length} entries`);
  } catch (error) {
    core.setFailed(`Failed to delete files: ${error.message}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
