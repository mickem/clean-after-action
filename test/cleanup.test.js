import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test, { afterEach, describe } from 'node:test';

import { buildPatterns, cleanWorkspace, getBoolInput } from '../cleanup.js';
import { cleanup, list, makeWorkspace } from './helpers.js';

const workspaces = [];

async function workspace(entries) {
  const directory = await makeWorkspace(entries);
  workspaces.push(directory);
  return directory;
}

/** Cleans a workspace with the logging silenced, returning what was deleted. */
function clean(options) {
  return cleanWorkspace({ log: () => {}, warn: () => {}, ...options });
}

afterEach(async () => {
  while (workspaces.length > 0) {
    await cleanup(workspaces.pop());
  }
  delete process.env.INPUT_KEEPGIT;
  delete process.env.INPUT_PATHS;
});

describe('cleanWorkspace', () => {
  test('deletes files and directories', async () => {
    const directory = await workspace({
      'file.txt': 'hello',
      build: { 'artifact.bin': 'binary' },
      '.git': { HEAD: 'ref: refs/heads/master' },
    });

    const deleted = await clean({ directory });

    assert.deepEqual(deleted.sort(), ['.git', 'build', 'file.txt']);
    assert.deepEqual(await list(directory), []);
  });

  test('keeps .git when keepGit is set', async () => {
    const directory = await workspace({
      'file.txt': 'hello',
      '.git': { HEAD: 'ref: refs/heads/master' },
      '.gitignore': 'node_modules',
    });

    const deleted = await clean({ directory, keepGit: true });

    assert.deepEqual(deleted.sort(), ['.gitignore', 'file.txt']);
    assert.deepEqual(await list(directory), ['.git']);
    assert.equal(
      await fs.readFile(path.join(directory, '.git', 'HEAD'), 'utf8'),
      'ref: refs/heads/master',
    );
  });

  test('deletes .git when keepGit is not set', async () => {
    const directory = await workspace({ '.git': { HEAD: 'ref: refs/heads/master' } });

    await clean({ directory });

    assert.deepEqual(await list(directory), []);
  });

  test('is a no-op on an empty directory', async () => {
    const directory = await workspace({});

    assert.deepEqual(await clean({ directory }), []);
  });

  test('deletes broken symlinks like the rest of the workspace', async () => {
    const directory = await workspace({ 'file.txt': 'hello' });
    await fs.symlink(path.join(directory, 'gone'), path.join(directory, 'broken.link'));

    const deleted = await clean({ directory });

    assert.deepEqual(deleted.sort(), ['broken.link', 'file.txt']);
    assert.deepEqual(await list(directory), []);
  });

  test('logs every entry it touches', async () => {
    const directory = await workspace({ 'file.txt': 'hello', '.git': { HEAD: 'x' } });
    const messages = [];

    await clean({ directory, keepGit: true, log: (message) => messages.push(message) });

    assert.deepEqual(messages.sort(), ['Deleting file.txt', 'Keeping .git']);
  });

  test('passes paths inside the directory to the remove function', async () => {
    const directory = await workspace({ 'file.txt': 'hello' });
    const removed = [];

    await clean({ directory, remove: async (target) => removed.push(target) });

    assert.deepEqual(
      removed.map((target) => path.relative(directory, target)),
      ['file.txt'],
    );
    // The injected remove did nothing, so the file must still be there.
    assert.deepEqual(await list(directory), ['file.txt']);
  });

  test('defaults to the current working directory', async () => {
    const directory = await workspace({ 'file.txt': 'hello' });
    const previous = process.cwd();
    try {
      process.chdir(directory);
      await clean({});
    } finally {
      process.chdir(previous);
    }

    assert.deepEqual(await list(directory), []);
  });

  test('propagates failures from remove', async () => {
    const directory = await workspace({ 'file.txt': 'hello' });

    await assert.rejects(
      () =>
        clean({
          directory,
          remove: async () => {
            throw new Error('permission denied');
          },
        }),
      /permission denied/,
    );
  });
});

describe('cleanWorkspace with custom paths', () => {
  test('cleans only what the patterns match', async () => {
    const directory = await workspace({
      'file.txt': 'hello',
      build: { 'artifact.bin': 'binary' },
      cache: { 'entry.bin': 'binary' },
    });

    const deleted = await clean({ directory, paths: 'build' });

    assert.deepEqual(deleted, ['build']);
    assert.deepEqual(await list(directory), ['cache', 'file.txt']);
  });

  test('supports several patterns, one per line', async () => {
    const directory = await workspace({
      'a.txt': 'a',
      'b.txt': 'b',
      'keep.md': 'keep',
    });

    const deleted = await clean({ directory, paths: 'a.txt\nb.txt' });

    assert.deepEqual(deleted.sort(), ['a.txt', 'b.txt']);
    assert.deepEqual(await list(directory), ['keep.md']);
  });

  test('excludes what a ! pattern matches', async () => {
    const directory = await workspace({
      'file.txt': 'hello',
      '.git': { HEAD: 'ref: refs/heads/master' },
      build: { 'artifact.bin': 'binary' },
    });

    const deleted = await clean({ directory, paths: '*\n!.git' });

    assert.deepEqual(deleted.sort(), ['build', 'file.txt']);
    assert.deepEqual(await list(directory), ['.git']);
  });

  test('matches by wildcard', async () => {
    const directory = await workspace({
      'a.log': 'a',
      'b.log': 'b',
      'keep.txt': 'keep',
    });

    const deleted = await clean({ directory, paths: '*.log' });

    assert.deepEqual(deleted.sort(), ['a.log', 'b.log']);
    assert.deepEqual(await list(directory), ['keep.txt']);
  });

  test('ignores blank lines and surrounding whitespace', async () => {
    const directory = await workspace({ 'file.txt': 'hello', 'keep.md': 'keep' });

    const deleted = await clean({ directory, paths: '\n  file.txt  \n\n' });

    assert.deepEqual(deleted, ['file.txt']);
    assert.deepEqual(await list(directory), ['keep.md']);
  });

  test('falls back to everything when the input is blank', async () => {
    const directory = await workspace({ 'file.txt': 'hello', '.hidden': 'x' });

    const deleted = await clean({ directory, paths: '   \n  ' });

    assert.deepEqual(deleted.sort(), ['.hidden', 'file.txt']);
  });

  test('keepGit wins over the patterns', async () => {
    const directory = await workspace({
      '.git': { HEAD: 'ref: refs/heads/master' },
      'file.txt': 'hello',
    });

    const deleted = await clean({ directory, paths: '*\n.git', keepGit: true });

    assert.deepEqual(deleted, ['file.txt']);
    assert.deepEqual(await list(directory), ['.git']);
  });

  test('refuses to delete the workspace itself', async () => {
    const directory = await workspace({ 'file.txt': 'hello', '.git': { HEAD: 'x' } });
    const warnings = [];

    const deleted = await clean({
      directory,
      paths: '.\n!.git',
      warn: (message) => warnings.push(message),
    });

    assert.deepEqual(deleted, [], 'nothing should be deleted');
    assert.deepEqual(await list(directory), ['.git', 'file.txt']);
    assert.match(warnings.join(''), /Refusing to delete the workspace itself/);
  });

  test('matches nothing when no pattern matches', async () => {
    const directory = await workspace({ 'file.txt': 'hello' });

    assert.deepEqual(await clean({ directory, paths: 'nothing-here/*' }), []);
    assert.deepEqual(await list(directory), ['file.txt']);
  });
});

describe('buildPatterns', () => {
  test('defaults to everything in the directory', () => {
    assert.deepEqual(buildPatterns({ directory: '/work' }), [path.join('/work', '*')]);
  });

  test('anchors patterns and negations at the directory', () => {
    assert.deepEqual(buildPatterns({ directory: '/work', paths: 'build\n!.git' }), [
      path.join('/work', 'build'),
      `!${path.join('/work', '.git')}`,
    ]);
  });

  test('appends the keepGit exclusion last', () => {
    assert.deepEqual(buildPatterns({ directory: '/work', paths: '*', keepGit: true }), [
      path.join('/work', '*'),
      `!${path.join('/work', '.git')}`,
    ]);
  });

  test('is usable with no arguments at all', () => {
    assert.deepEqual(buildPatterns(), ['*']);
  });
});

describe('getBoolInput', () => {
  const enabled = ['true', 'TRUE', 'True', '1', 'yes', 'y', 'on', ' true '];
  const disabled = ['false', 'FALSE', '0', 'no', 'n', 'off', '', '   '];

  for (const value of enabled) {
    test(`treats ${JSON.stringify(value)} as true`, () => {
      process.env.INPUT_KEEPGIT = value;
      assert.equal(getBoolInput('keepGit'), true);
    });
  }

  for (const value of disabled) {
    test(`treats ${JSON.stringify(value)} as false`, () => {
      process.env.INPUT_KEEPGIT = value;
      assert.equal(getBoolInput('keepGit'), false);
    });
  }

  test('is false when the input is not set at all', () => {
    delete process.env.INPUT_KEEPGIT;
    assert.equal(getBoolInput('keepGit'), false);
  });
});
