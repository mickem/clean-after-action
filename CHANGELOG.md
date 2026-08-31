# Changelog

Release notes for earlier versions are on the
[releases page](https://github.com/mickem/clean-after-action/releases).

## 2.1.0 (unreleased)

### Fixed

- **Runs on the `node24` runtime.** The action declared `node16`, which GitHub has retired: it
  was being force-run on a newer runtime and would eventually have stopped working
  ([#6](https://github.com/mickem/clean-after-action/issues/6)).
- **`keepGit` works.** The input was inverted, so `keepGit: true` deleted the `.git` folder while
  leaving the input unset kept it. It now behaves as documented.
- **Cleanup failures fail the step.** The directory listing used a callback inside an `async`
  function, so errors escaped the `try`/`catch` and the step could report success before the
  files were actually deleted. It is now awaited properly.

### Changed

- Updated `@actions/core` to 3.x and `@actions/io` to 3.x, and moved the sources to ES modules
  (which those versions require).
- Added a test suite on the node test runner and a CI pipeline that runs it on node 22 and 24,
  plus a self test job that runs the action against its own workspace on every push.
- Replaced the third party release action with [`scripts/release.sh`](scripts/release.sh); the
  previous one was itself stuck on the retired `node16` runtime. See
  [RELEASING.md](RELEASING.md).
- Added a `LICENSE` file for the MIT license the project has always declared, and Dependabot
  updates for npm and actions.

### Upgrade notes

- The action now needs a runner providing the `node24` runtime. GitHub hosted runners have it;
  a self hosted runner may need its runner software updated.
- Workspaces that were keeping their `.git` folder *because* `keepGit` was inverted will now
  have it deleted. Set `keepGit: true` to keep it.
