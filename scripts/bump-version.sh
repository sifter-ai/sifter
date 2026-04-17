#!/usr/bin/env bash
# Usage: ./scripts/bump-version.sh 0.2.0
set -euo pipefail

NEW_VERSION="${1:?Usage: $0 <version>}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Python packages
for dir in code code/sdk code/mcp code/cli code/server; do
    f="$REPO_ROOT/$dir/pyproject.toml"
    [ -f "$f" ] && sed -i "s/^version = \".*\"/version = \"$NEW_VERSION\"/" "$f" && echo "updated $dir/pyproject.toml"
done

# npm packages
for pkg in code/sdk-ts code/zapier code/frontend; do
    f="$REPO_ROOT/$pkg/package.json"
    [ -f "$f" ] && sed -i "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" "$f" && echo "updated $pkg/package.json"
done

echo ""
echo "All packages bumped to $NEW_VERSION"
echo ""
echo "Next steps:"
echo "  git add -A"
echo "  git commit -m 'chore: bump version to $NEW_VERSION'"
echo "  git tag v$NEW_VERSION"
echo "  git push && git push --tags"
