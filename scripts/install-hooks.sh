#!/bin/sh
# Install repo git hooks into .git/hooks. Re-run any time the hook
# scripts in scripts/git-hooks/ change.

set -e
root=$(git rev-parse --show-toplevel)

for hook in commit-msg; do
  src="$root/scripts/git-hooks/$hook"
  dst="$root/.git/hooks/$hook"
  cp -f "$src" "$dst"
  chmod +x "$dst"
  echo "installed: $dst"
done
