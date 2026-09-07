# Cleanup after build

Cleanup the work directory for self hosted runners after they finish building.

## Example usage

```yaml
- uses: mickem/clean-after-action@v2
```

It is important that this is run before any caching tasks as cleanups are run in reverse order (and you do not want to cleanup before the caching is saved).

A more full example:
```yaml
jobs:
  build:
    runs-on: onprem
    steps:
    - uses: mickem/clean-after-action@v2
    - uses: actions/checkout@v7
    - uses: actions/cache@v4
    # ....
```

## Requirements

The action runs on the `node24` runtime, which needs a runner recent enough to provide it
(GitHub hosted runners, or a self hosted runner on a current release). Older releases are still
available as `@v1`.

## Inputs

### keepGit

Set this to true to prevent the `.git` folder to be deleted.

```yaml
- uses: mickem/clean-after-action@v2
  with:
    keepGit: true
```

The input is off unless it is set: `false`, `0`, `no`, `n`, `off` and an empty value keep the
default behaviour of deleting everything, any other value keeps the `.git` folder.

### paths

By default everything in the workspace is deleted. Set `paths` to clean up only part of it:
glob patterns relative to the workspace, one per line. Prefix a pattern with `!` to keep what
it matches.

```yaml
- uses: mickem/clean-after-action@v2
  with:
    paths: |
      build
      *.log
```

Keeping something is the `!` form, so this deletes everything except the `.git` folder (the
same thing `keepGit: true` does):

```yaml
- uses: mickem/clean-after-action@v2
  with:
    paths: |
      *
      !.git
```

Note that `*` means "everything in the workspace", including dot files. Do **not** use `.` for
that: `.` matches the workspace directory itself, so it would delete the workspace along with
anything a later `!` pattern was meant to keep. The action refuses to do that and warns
instead, but `*` is what you want.

`keepGit: true` still works alongside `paths` and always wins, so `.git` survives regardless of
what the patterns match.

## What about docker actions?

If you use docker actions files will be created by "root" and this action will fail to delete generated files.

This can be solved by forcing docker containers to run as the same user as the user which runs your self hosted runner.
[To do this you can use the user-remap feature in docker](https://docs.docker.com/engine/security/userns-remap/).

## Motivation

There are a number of other actions which "solves this problem" by deleting files as the action runs (instead of as a cleanup action).
The main problem with running clean up as a build step is that it will run "before other cleanup steps".
This will effectively break things like caching and similar things which require files to be left when their cleanup runs.

A similar argument can be made for running cleanup before you build, this means the disk will eventually become full as more and more projects build.

## Development

The action has no build step: `index.js` and `cleanup.js` are what the runner executes.

```shell
npm ci
npm test              # unit and end to end tests
npm run test:coverage # the same tests with coverage thresholds enforced
```

Tests live in [`test/`](test) and run on the node test runner, so there is no test framework to
install. `test/cleanup.test.js` covers the cleaning logic against real temporary directories and
`test/action.test.js` starts the entry points the way the runner does (`node cleanup.js` with the
`INPUT_*` environment variables set) and checks the runtime declared in `action.yml`.

See [RELEASING.md](RELEASING.md) for how a release is built and published.
