# Feature documentation

Per-branch markdown files documenting non-trivial changes to the codebase. These are written at PR time and frozen — they capture the state and reasoning when the work landed. Later changes get their own feature doc, not edits to old ones.

## When to create one

- Any feature branch with more than ~100 lines of changes.
- Any branch that introduces a corporate / legal / compliance decision (entity names, governing law, disclosure language, etc.).
- Any branch with TODOs that need to outlive the PR — for example, "pharmacy partner name TBD," "attorney review pending," "tier pricing pending product input."
- Any branch that establishes a new convention or pattern future devs need to know about.

## Naming

`<branch-name>.md` — same as the git branch, kebab-cased. One file per branch.

## Suggested structure

- **Purpose** — what problem this branch solves and why.
- **Commits** — short list of SHAs and one-line summaries.
- **What landed** — the actual changes, organized by area.
- **Key decisions** — non-obvious calls and the reasoning.
- **TODOs / launch blockers** — work that didn't make this PR but still needs to happen, with enough context for someone else to pick it up.
- **File map** — which files were touched.
- **Testing notes** — how to verify the work, what to watch for.

Length is fine; clarity matters more than brevity.

## Auto-appended commit log

Each feature MD has a `## Commit log (auto-appended)` section at the bottom that's updated automatically on every `git commit` (date + subject + diff stat). The logic lives in `.githooks/prepare-commit-msg` and the entry is folded into the same commit that triggered it, so the doc stays in lockstep with history.

After cloning, run once to enable:

```
git config core.hooksPath .githooks
```

Skipped automatically for: `main`/`master`/`develop`/`dev`/`trunk`, merge/squash/amend commits, and branches without a matching `docs/features/<branch>.md`.
