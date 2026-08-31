# Releasing

This action is consumed straight from this repository: when a workflow says
`uses: mickem/clean-after-action@v2` GitHub checks out that ref and runs `index.js` /
`cleanup.js` with the node runtime declared in [`action.yml`](action.yml). There is no install
step on the consumer side, so a release is a ref that contains the action files **together with
their runtime dependencies**.

That content is built and published by [`scripts/release.sh`](scripts/release.sh), which the
`release` job in [`.github/workflows/build.yaml`](.github/workflows/build.yaml) runs whenever a
version tag is pushed.

## What a release publishes

Pushing the tag `v2.1.0` makes the workflow build a commit containing `action.yml`, `index.js`,
`cleanup.js`, `package.json`, `README.md`, `LICENSE` and `node_modules` (production
dependencies only), and publish it as:

| Ref                          | Meaning                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| `refs/heads/releases/v2`     | branch holding the built content                            |
| `refs/tags/v2.1.0`           | moved from the source commit to the built commit            |
| `refs/tags/v2.1`             | moving minor tag                                            |
| `refs/tags/v2`               | moving major tag — this is what users reference             |

Tests, CI configuration and the lock file are deliberately left out of the release refs.

The release branch and the three tags are force-updated on every release; older releases stay
reachable through their own patch tags (`v2.0.0`, `v1.1.1`, …).

## Releasing

1. Make sure `master` is green and that everything you want to ship is merged.
2. Pick the new version according to semver:
   - **patch** — bug fixes only;
   - **minor** — new inputs or behaviour that existing workflows keep working with;
   - **major** — anything that can break an existing workflow, including raising the required
     runner/node version. Consumers pinned to `@v2` are moved automatically by the moving major
     tag, so a breaking change *must* go out as a new major.
3. Update `version` in [`package.json`](package.json) and refresh
   [`CHANGELOG.md`](CHANGELOG.md), then commit and push to `master`:
   ```shell
   npm version 2.1.0 --no-git-tag-version
   git commit -am "chore: release 2.1.0"
   git push origin master
   ```
4. Optionally rehearse the release with a test tag first (this only touches `test/`-prefixed
   tags and the `releases/test/v2` branch):
   ```shell
   git tag test/v2.1.0 && git push origin test/v2.1.0
   ```
   Then point a scratch workflow at `mickem/clean-after-action@test/v2` and check it runs.
5. Tag and push the real release:
   ```shell
   git tag v2.1.0 && git push origin v2.1.0
   ```
6. Watch the `Release` job in the *Build* workflow. When it finishes, verify the published
   content:
   ```shell
   git fetch origin --force --tags
   git show --stat v2.1.0 -- . ':(exclude)node_modules'
   git ls-tree v2 --name-only
   ```
7. Create the GitHub release notes for the tag (Releases → *Draft a new release* → pick the
   existing `v2.1.0` tag → *Generate release notes*).
8. The Marketplace listing follows the tag, so if the description or branding changed, check the
   listing at <https://github.com/marketplace/actions/clean-after>.

## Releasing by hand

If the workflow is unavailable, the same script can be run locally with a token that may push
to the repository:

```shell
npm ci --omit=dev
npm run test:coverage
DRY_RUN=true scripts/release.sh v2.1.0     # prints what would be published
GITHUB_TOKEN=<token> scripts/release.sh v2.1.0
```

`DRY_RUN=true` builds the release commit in a temporary directory and prints its contents
without pushing anything, which is also the quickest way to check what a release would contain.

## Keeping the release runnable

GitHub retires the node runtimes that JavaScript actions declare (`node12`, `node16`, `node20` …),
and an action left on a retired runtime is first force-run on a newer one and then stops working
(see [issue #6](https://github.com/mickem/clean-after-action/issues/6)). Two things guard against
that:

- `test/action.test.js` asserts the runtime declared in `action.yml`, so bumping it is a
  deliberate, reviewed change;
- the `self-test` job runs the action against itself on every push, so a runtime or dependency
  that no longer works fails CI rather than the consumers' workflows.

Dependency and action updates arrive as Dependabot pull requests
([`.github/dependabot.yml`](.github/dependabot.yml)); merging them keeps the released
`node_modules` current, and the next release picks them up.
