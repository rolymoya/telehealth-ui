#!/usr/bin/env bash
# PostToolUse hook for Bash: when Claude creates a new git branch via
# `git checkout -b <name>` or `git switch -c <name>`, create a templated
# feature doc at docs/features/<name>.md (idempotent — never overwrites).
# Silent on success and on skip; only writes to stderr on real errors.

set -u

input="$(cat)"

# Extract the bash command that was just run.
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // ""')"
[ -n "$cmd" ] || exit 0

# Match the two explicit "create a new branch" commands.
# (Plain `git branch <name>` is intentionally excluded to avoid false matches.)
branch=""
if printf '%s' "$cmd" | grep -qE '(^|[[:space:];&|])git[[:space:]]+checkout[[:space:]]+-b[[:space:]]+'; then
  branch="$(printf '%s' "$cmd" | sed -E 's/.*git[[:space:]]+checkout[[:space:]]+-b[[:space:]]+([^[:space:];&|]+).*/\1/')"
elif printf '%s' "$cmd" | grep -qE '(^|[[:space:];&|])git[[:space:]]+switch[[:space:]]+-c[[:space:]]+'; then
  branch="$(printf '%s' "$cmd" | sed -E 's/.*git[[:space:]]+switch[[:space:]]+-c[[:space:]]+([^[:space:];&|]+).*/\1/')"
fi

[ -n "$branch" ] || exit 0

# Skip default/long-lived branches.
case "$branch" in
  main|master|develop|dev|trunk|release*|hotfix*) exit 0 ;;
esac

# Resolve repo root; bail silently if not in a git repo.
repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
target_dir="$repo_root/docs/features"

# Only act if the project has opted into the convention by creating the directory.
[ -d "$target_dir" ] || exit 0

target_file="$target_dir/$branch.md"

# Idempotent: never overwrite an existing doc.
[ -e "$target_file" ] && exit 0

# Write the template.
cat > "$target_file" <<EOF
# $branch

| | |
|---|---|
| Branch | \`$branch\` |
| PR | _link will be added when PR is opened_ |
| Status | In progress |

## Purpose

_Why this branch exists and what problem it solves. Replace this paragraph before the PR is opened._

## Commits

_See "Commit log" below for the auto-appended record. Use this section for a higher-level narrative once the work is done._

## What landed

_Summarize the actual changes when the work is complete, organized by area._

## Key decisions

_Non-obvious calls and the reasoning behind them — the things a future reader could not derive from the diff._

## TODOs / launch blockers

_Work that did not make this PR but still needs to happen. Include enough context for someone else to pick it up._

- [ ]

## File map

### New files

### Modified files

## Testing notes

_How to verify the work and what to watch for in review._
EOF

exit 0
