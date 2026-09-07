import * as core from '@actions/core';
import * as glob from '@actions/glob';
import * as io from '@actions/io';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// Values which are treated as "off" for a boolean input. Anything else (including
// the input being set to any other text) is treated as "on".
const FALSE_VALUES = ['false', '0', '', 'no', 'n', 'off'];

// Everything in the workspace, dot files included. This is what the action deleted before
// the paths input existed, so it stays the default.
const DEFAULT_PATTERN = '*';

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
 * Turns the `paths` input into glob patterns anchored at the directory being cleaned.
 *
 * Patterns are written relative to the workspace (`build`, `!.git`), but the globber matches
 * against the process working directory, so they are joined onto the directory here. That
 * keeps the directory injectable instead of the tests having to chdir.
 *
 * @param {object} [options]
 * @param {string} [options.directory] directory the patterns are relative to
 * @param {string} [options.paths] the raw `paths` input, one pattern per line
 * @param {boolean} [options.keepGit] when true a trailing `!.git` is appended
 * @returns {string[]} absolute patterns, negations keeping their `!` prefix
 */
export function buildPatterns({ directory = '.', paths = '', keepGit = false } = {}) {
  const patterns = paths
    .split('\n')
    .map((pattern) => pattern.trim())
    .filter(Boolean);
  if (patterns.length === 0) {
    patterns.push(DEFAULT_PATTERN);
  }
  // Appended last so it wins over whatever the caller asked for.
  if (keepGit) {
    patterns.push('!.git');
  }
  return patterns.map((pattern) =>
    pattern.startsWith('!')
      ? `!${path.join(directory, pattern.slice(1))}`
      : path.join(directory, pattern),
  );
}

/**
 * Resolves glob patterns to the entries they match.
 *
 * @param {string[]} patterns patterns from buildPatterns
 * @returns {Promise<string[]>} absolute paths to delete
 */
export async function findTargets(patterns) {
  const globber = await glob.create(patterns.join('\n'), {
    // We delete whatever we match, so there is no point enumerating the contents as well.
    implicitDescendants: false,
    // Not following symlinks keeps the cleanup inside the workspace instead of reaching
    // through a symlinked directory, and it is the only setting under which a broken symlink
    // is returned rather than silently skipped (the default) or raised as an error.
    followSymbolicLinks: false,
    matchDirectories: true,
  });
  return globber.glob();
}

/**
 * Deletes the entries of a directory which match the configured patterns.
 *
 * @param {object} [options]
 * @param {string} [options.directory] directory to clean, defaults to the workspace (cwd)
 * @param {string} [options.paths] glob patterns to clean, one per line
 * @param {boolean} [options.keepGit] when true the `.git` folder is left alone
 * @param {(message: string) => void} [options.log] logger, injectable for tests
 * @param {(message: string) => void} [options.warn] warning logger, injectable for tests
 * @param {(target: string) => Promise<void>} [options.remove] delete function, injectable for tests
 * @param {(patterns: string[]) => Promise<string[]>} [options.find] globber, injectable for tests
 * @returns {Promise<string[]>} the entries which were deleted, relative to the directory
 */
export async function cleanWorkspace({
  directory = '.',
  paths = '',
  keepGit = false,
  log = core.info,
  warn = core.warning,
  remove = io.rmRF,
  find = findTargets,
} = {}) {
  const root = path.resolve(directory);
  const targets = await find(buildPatterns({ directory, paths, keepGit }));
  if (keepGit) {
    log('Keeping .git');
  }
  const deleted = [];
  for (const target of targets) {
    if (path.resolve(target) === root) {
      // A `.` pattern resolves to the workspace directory itself, and deleting that takes
      // everything with it, including whatever the other patterns meant to keep.
      warn("Refusing to delete the workspace itself; use '*' to mean everything in it.");
      continue;
    }
    const name = path.relative(root, target);
    log(`Deleting ${name}`);
    await remove(target);
    deleted.push(name);
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
    const paths = core.getInput('paths');
    const deleted = await cleanWorkspace({ keepGit, paths, ...options });
    core.info(`Finished, deleted ${deleted.length} entries`);
  } catch (error) {
    core.setFailed(`Failed to delete files: ${error.message}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
