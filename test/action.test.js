import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test, { afterEach, describe } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { run } from '../cleanup.js';
import { cleanup, list, makeWorkspace } from './helpers.js';

const execFileAsync = promisify(execFile);
const root = path.dirname(fileURLToPath(import.meta.url)).replace(/test$/, '');

const workspaces = [];

async function workspace(entries) {
  const directory = await makeWorkspace(entries);
  workspaces.push(directory);
  return directory;
}

/** Runs one of the action entry points the way the runner does: `node <file>`. */
function runEntryPoint(file, { cwd, keepGit, paths }) {
  return execFileAsync(process.execPath, [path.join(root, file)], {
    cwd,
    env: { ...process.env, INPUT_KEEPGIT: keepGit ?? '', INPUT_PATHS: paths ?? '' },
  });
}

afterEach(async () => {
  while (workspaces.length > 0) {
    await cleanup(workspaces.pop());
  }
});

describe('action entry points', () => {
  test('index.js only announces the cleanup', async () => {
    const directory = await workspace({ 'file.txt': 'hello' });

    const { stdout } = await runEntryPoint('index.js', { cwd: directory });

    assert.match(stdout, /Scheduling cleanup at end/);
    assert.deepEqual(await list(directory), ['file.txt'], 'index.js must not delete anything');
  });

  test('cleanup.js empties the workspace it is started in', async () => {
    const directory = await workspace({
      'file.txt': 'hello',
      build: { 'artifact.bin': 'binary' },
      '.git': { HEAD: 'ref: refs/heads/master' },
    });

    const { stdout } = await runEntryPoint('cleanup.js', { cwd: directory });

    assert.match(stdout, /Deleting file\.txt/);
    assert.match(stdout, /Finished, deleted 3 entries/);
    assert.deepEqual(await list(directory), []);
  });

  test('cleanup.js honours keepGit=true', async () => {
    const directory = await workspace({
      'file.txt': 'hello',
      '.git': { HEAD: 'ref: refs/heads/master' },
    });

    const { stdout } = await runEntryPoint('cleanup.js', { cwd: directory, keepGit: 'true' });

    assert.match(stdout, /Keeping \.git/);
    assert.deepEqual(await list(directory), ['.git']);
  });

  test('cleanup.js deletes .git when keepGit is not passed', async () => {
    const directory = await workspace({ '.git': { HEAD: 'ref: refs/heads/master' } });

    await runEntryPoint('cleanup.js', { cwd: directory });

    assert.deepEqual(await list(directory), []);
  });

  test('cleanup.js cleans only the paths it is given', async () => {
    const directory = await workspace({
      'file.txt': 'hello',
      build: { 'artifact.bin': 'binary' },
      cache: { 'entry.bin': 'binary' },
    });

    const { stdout } = await runEntryPoint('cleanup.js', { cwd: directory, paths: 'build' });

    assert.match(stdout, /Deleting build/);
    assert.match(stdout, /Finished, deleted 1 entries/);
    assert.deepEqual(await list(directory), ['cache', 'file.txt']);
  });

  test('cleanup.js honours a ! exclusion in paths', async () => {
    const directory = await workspace({
      'file.txt': 'hello',
      '.git': { HEAD: 'ref: refs/heads/master' },
    });

    await runEntryPoint('cleanup.js', { cwd: directory, paths: '*\n!.git' });

    assert.deepEqual(await list(directory), ['.git']);
  });

  test('cleanup.js refuses to delete the workspace itself', async () => {
    const directory = await workspace({ 'file.txt': 'hello' });

    const { stdout } = await runEntryPoint('cleanup.js', { cwd: directory, paths: '.' });

    assert.match(stdout, /::warning::Refusing to delete the workspace itself/);
    assert.deepEqual(await list(directory), ['file.txt']);
  });

  test('run() fails the step instead of throwing when cleaning fails', async () => {
    const directory = await workspace({ 'file.txt': 'hello' });
    const messages = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, ...rest) => {
      messages.push(String(chunk));
      return write(chunk, ...rest);
    };
    try {
      await run({
        directory,
        log: () => {},
        remove: async () => {
          throw new Error('permission denied');
        },
      });
    } finally {
      process.stdout.write = write;
    }

    assert.equal(process.exitCode, 1, 'the step should be marked as failed');
    process.exitCode = 0;
    assert.match(messages.join(''), /::error::Failed to delete files: permission denied/);
  });

  test('run() reads keepGit from the environment', async () => {
    const directory = await workspace({
      'file.txt': 'hello',
      '.git': { HEAD: 'ref: refs/heads/master' },
    });
    process.env.INPUT_KEEPGIT = 'true';
    try {
      await run({ directory, log: () => {} });
    } finally {
      delete process.env.INPUT_KEEPGIT;
    }

    assert.deepEqual(await list(directory), ['.git']);
  });
});

describe('action.yml', () => {
  test('runs on a supported node runtime and points at existing files', async () => {
    const action = await fs.readFile(path.join(root, 'action.yml'), 'utf8');

    const using = action.match(/using:\s*'?(?<runtime>[\w]+)'?/).groups.runtime;
    const main = action.match(/main:\s*'?(?<file>[\w.]+)'?/).groups.file;
    const post = action.match(/post:\s*'?(?<file>[\w.]+)'?/).groups.file;

    // Guards against regressing to a deprecated runtime, see issue #6.
    assert.equal(using, 'node24');
    await fs.access(path.join(root, main));
    await fs.access(path.join(root, post));
  });
});
