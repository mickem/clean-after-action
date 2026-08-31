import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test, { afterEach, describe } from 'node:test';

import { cleanWorkspace, getBoolInput } from '../cleanup.js';
import { cleanup, list, makeWorkspace } from './helpers.js';

const workspaces = [];

async function workspace(entries) {
  const directory = await makeWorkspace(entries);
  workspaces.push(directory);
  return directory;
}

afterEach(async () => {
  while (workspaces.length > 0) {
    await cleanup(workspaces.pop());
  }
  delete process.env.INPUT_KEEPGIT;
});

describe('cleanWorkspace', () => {
  test('deletes files and directories', async () => {
    const directory = await workspace({
      'file.txt': 'hello',
      build: { 'artifact.bin': 'binary' },
      '.git': { HEAD: 'ref: refs/heads/master' },
    });

    const deleted = await cleanWorkspace({ directory, log: () => {} });

    assert.deepEqual(deleted.sort(), ['.git', 'build', 'file.txt']);
    assert.deepEqual(await list(directory), []);
  });

  test('keeps .git when keepGit is set', async () => {
    const directory = await workspace({
      'file.txt': 'hello',
      '.git': { HEAD: 'ref: refs/heads/master' },
      '.gitignore': 'node_modules',
    });

    const deleted = await cleanWorkspace({ directory, keepGit: true, log: () => {} });

    assert.deepEqual(deleted.sort(), ['.gitignore', 'file.txt']);
    assert.deepEqual(await list(directory), ['.git']);
    assert.equal(
      await fs.readFile(path.join(directory, '.git', 'HEAD'), 'utf8'),
      'ref: refs/heads/master',
    );
  });

  test('deletes .git when keepGit is not set', async () => {
    const directory = await workspace({ '.git': { HEAD: 'ref: refs/heads/master' } });

    await cleanWorkspace({ directory, log: () => {} });

    assert.deepEqual(await list(directory), []);
  });

  test('is a no-op on an empty directory', async () => {
    const directory = await workspace({});

    assert.deepEqual(await cleanWorkspace({ directory, log: () => {} }), []);
  });

  test('logs every entry it touches', async () => {
    const directory = await workspace({ 'file.txt': 'hello', '.git': { HEAD: 'x' } });
    const messages = [];

    await cleanWorkspace({ directory, keepGit: true, log: (message) => messages.push(message) });

    assert.deepEqual(messages.sort(), ['Deleting file.txt', 'Keeping .git']);
  });

  test('passes paths inside the directory to the remove function', async () => {
    const directory = await workspace({ 'file.txt': 'hello' });
    const removed = [];

    await cleanWorkspace({
      directory,
      log: () => {},
      remove: async (target) => removed.push(target),
    });

    assert.deepEqual(removed, [path.join(directory, 'file.txt')]);
    // The injected remove did nothing, so the file must still be there.
    assert.deepEqual(await list(directory), ['file.txt']);
  });

  test('defaults to the current working directory', async () => {
    const directory = await workspace({ 'file.txt': 'hello' });
    const previous = process.cwd();
    try {
      process.chdir(directory);
      await cleanWorkspace({ log: () => {} });
    } finally {
      process.chdir(previous);
    }

    assert.deepEqual(await list(directory), []);
  });

  test('rejects when the directory cannot be read', async () => {
    await assert.rejects(
      () => cleanWorkspace({ directory: path.join('does', 'not', 'exist'), log: () => {} }),
      /ENOENT/,
    );
  });

  test('propagates failures from remove', async () => {
    const directory = await workspace({ 'file.txt': 'hello' });

    await assert.rejects(
      () =>
        cleanWorkspace({
          directory,
          log: () => {},
          remove: async () => {
            throw new Error('permission denied');
          },
        }),
      /permission denied/,
    );
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
