#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "This command must be run inside a git repository."
  exit 1
fi

EXCLUDE_FILE="$(git rev-parse --git-dir)/info/exclude"
mkdir -p "$(dirname "$EXCLUDE_FILE")"
touch "$EXCLUDE_FILE"

add_if_missing() {
  local pattern="$1"
  if ! grep -Fxq "$pattern" "$EXCLUDE_FILE"; then
    printf '%s\n' "$pattern" >>"$EXCLUDE_FILE"
    echo "Added: $pattern"
  fi
}

add_header_if_missing() {
  local header="$1"
  if ! grep -Fxq "$header" "$EXCLUDE_FILE"; then
    printf '\n%s\n' "$header" >>"$EXCLUDE_FILE"
  fi
}

add_header_if_missing "# EDS local-only excludes"

# Defaults for local development scratch output.
DEFAULT_PATTERNS=(
  ".vite-build/"
  "tmp/"
  ".local/"
  "drafts/local/"
  "blocks/hero/hero.css"
  "blocks/hero/hero.ts"
)

for pattern in "${DEFAULT_PATTERNS[@]}"; do
  add_if_missing "$pattern"
done

# Optional custom patterns can be passed as arguments:
# npm run setup:local -- "path/or/pattern"
for pattern in "$@"; do
  add_if_missing "$pattern"
done

echo "Updated $EXCLUDE_FILE"
echo "Note: info/exclude only affects untracked files."
