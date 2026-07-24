# CLAUDE.md — MenuMaker (`menumaker-app`)

Repo-level guidance for Claude Code working in **this** repository.

> The global `~/CLAUDE.md` documents the CACFP Kitchen System and `my-daycare-app` —
> **not** this repo. Do not edit `~/CLAUDE.md` for MenuMaker work, and do not treat its
> contents as canon here.

## Where canon lives

All cross-cutting rules live in **[`docs/platform-standards.md`](docs/platform-standards.md)**
(owner: Nikolay), indexed by **[`docs/DECISIONS.md`](docs/DECISIONS.md)**. Read both before
designing anything. Search them by the **noun of the function**, not the word of your task.

## Working protocol (non-negotiable)

- **prepare → show → go → apply → read-back.** Nothing lands without an explicit "go" for
  that specific action. A read-back proves the change landed; **a read-back never writes.**
- **Forward-only.** Migrations and signed records are never rewritten — a mistake is fixed by
  a new forward migration/record, never by editing the old one.
- **Merge / push / prod-apply happen only by word.** Code-approved ≠ release-approved.
  Push ≠ deploy. A stop-point is not crossed without an in-chat "go" for that exact action.
- **Definition of Done ships with the code:** a `docs/CHANGELOG.md` line + any
  registry / `DECISIONS.md` entry in the **same commit** as the change.

## Canon, one line

**Ready-made forms first** — never build a blank, render, print view, or screen form when a
ready-made original already exists (check in order: `enroll-registry.json` →
`pa082508.github.io` forms repo → `forms/3-library` → `public/forms/`). Use it byte-for-byte;
register any genuinely new one so it becomes the ready-made next time. Full rule in
[`docs/platform-standards.md`](docs/platform-standards.md).
