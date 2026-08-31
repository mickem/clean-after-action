import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Creates a throw away directory populated with the given entries.
 *
 * @param {Record<string, string|Record<string,string>>} entries file name -> contents,
 *        an object value creates a directory containing those files.
 * @returns {Promise<string>} path to the created directory
 */
export async function makeWorkspace(entries) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clean-after-action-'));
  for (const [name, contents] of Object.entries(entries)) {
    const target = path.join(directory, name);
    if (typeof contents === 'string') {
      await fs.writeFile(target, contents);
    } else {
      await fs.mkdir(target, { recursive: true });
      for (const [child, childContents] of Object.entries(contents)) {
        await fs.writeFile(path.join(target, child), childContents);
      }
    }
  }
  return directory;
}

/** Lists the entries of a directory, sorted so assertions are stable. */
export async function list(directory) {
  return (await fs.readdir(directory)).sort();
}

/** Removes a throw away directory, ignoring the case where a test already deleted it. */
export async function cleanup(directory) {
  await fs.rm(directory, { recursive: true, force: true });
}
