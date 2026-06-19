#!/bin/bash
# Install git hooks from scripts/hooks/ into .git/hooks/.
# Run once after cloning: bash scripts/install-hooks.sh

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_SRC="$REPO_ROOT/scripts/hooks"
HOOKS_DEST="$REPO_ROOT/.git/hooks"

if [ ! -d "$HOOKS_SRC" ]; then
    echo "Error: $HOOKS_SRC not found. Run from repo root."
    exit 1
fi

for hook in "$HOOKS_SRC"/*; do
    name="$(basename "$hook")"
    dest="$HOOKS_DEST/$name"
    ln -sf "$REPO_ROOT/scripts/hooks/$name" "$dest"
    chmod +x "$dest"
    echo "Installed: .git/hooks/$name → scripts/hooks/$name"
done

echo "Done."
