#!/usr/bin/env bash
#
# Publishes a release of the action.
#
# GitHub runs a JavaScript action straight from the repository it is referenced from, so a
# release is a branch/tag which contains the action files *plus* their runtime dependencies
# (there is no install step on the consumer side). This script builds that content from the
# tagged commit and publishes it as:
#
#   refs/heads/releases/vX  - the release branch holding the built content
#   refs/tags/vX.Y.Z        - moved from the source commit to the built commit
#   refs/tags/vX.Y          - moving minor tag
#   refs/tags/vX            - moving major tag, this is what users reference
#
# A tag of the form `test/vX.Y.Z` publishes the same content under `test/` prefixed tags and
# the `releases/test/vX` branch, so a release can be rehearsed without touching the real tags.
#
# Usage: scripts/release.sh <tag>   (defaults to $GITHUB_REF_NAME)
#
set -euo pipefail

TAG="${1:-${GITHUB_REF_NAME:-}}"
if [[ -z "${TAG}" ]]; then
  echo "usage: $0 <tag>" >&2
  exit 2
fi

PREFIX=""
VERSION="${TAG}"
if [[ "${TAG}" == test/* ]]; then
  PREFIX="test/"
  VERSION="${TAG#test/}"
fi

if [[ ! "${VERSION}" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "error: '${TAG}' is not a release tag, expected [test/]vMAJOR.MINOR.PATCH" >&2
  exit 1
fi
MAJOR="v${BASH_REMATCH[1]}"
MINOR="v${BASH_REMATCH[1]}.${BASH_REMATCH[2]}"
BRANCH="releases/${PREFIX}${MAJOR}"

# Everything the action needs at runtime, and nothing else: no tests, no CI config, no lock file.
RELEASE_FILES=(action.yml index.js cleanup.js package.json README.md LICENSE node_modules)

REPOSITORY="${GITHUB_REPOSITORY:-mickem/clean-after-action}"
SOURCE_SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -d "${SOURCE_DIR}/node_modules/@actions/core" ]]; then
  echo "error: dependencies are missing, run 'npm ci --omit=dev' first" >&2
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "${STAGE}"' EXIT

for file in "${RELEASE_FILES[@]}"; do
  if [[ -e "${SOURCE_DIR}/${file}" ]]; then
    cp -a "${SOURCE_DIR}/${file}" "${STAGE}/"
  else
    echo "note: skipping missing ${file}"
  fi
done

cd "${STAGE}"
git init --quiet --initial-branch "${BRANCH}"
git config user.name "${GIT_USER_NAME:-github-actions[bot]}"
git config user.email "${GIT_USER_EMAIL:-41898282+github-actions[bot]@users.noreply.github.com}"
# node_modules is ignored in the source tree, here it is the point of the commit.
git add --all --force
git commit --quiet --message "build: release ${TAG} from ${SOURCE_SHA}"
BUILT_SHA="$(git rev-parse HEAD)"

echo "Built ${TAG} as ${BUILT_SHA}:"
git -c core.pager=cat show --stat --oneline HEAD -- . ':(exclude)node_modules'

if [[ "${DRY_RUN:-}" == "true" ]]; then
  echo "DRY_RUN=true, not pushing ${BRANCH} / ${PREFIX}{${MAJOR},${MINOR},${VERSION}}"
  exit 0
fi

if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  REMOTE="https://x-access-token:${GITHUB_TOKEN}@github.com/${REPOSITORY}.git"
else
  REMOTE="https://github.com/${REPOSITORY}.git"
fi
git remote add origin "${REMOTE}"

# The release branch is a rebuild of the tagged source, so it is always replaced. Older
# releases stay reachable through their own tags.
git push --force --quiet origin "HEAD:refs/heads/${BRANCH}"
git push --force --quiet origin \
  "HEAD:refs/tags/${PREFIX}${VERSION}" \
  "HEAD:refs/tags/${PREFIX}${MINOR}" \
  "HEAD:refs/tags/${PREFIX}${MAJOR}"

echo "Published ${PREFIX}${VERSION}, ${PREFIX}${MINOR} and ${PREFIX}${MAJOR} -> ${BUILT_SHA} (branch ${BRANCH})"
