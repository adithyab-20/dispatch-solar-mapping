# Domain Docs

How the engineering skills should consume this repo's project and domain documentation when exploring the codebase.

## Project guidance

Before planning, implementing, or evaluating the application, read these together:

- **`Software Engineer Intern - Technical Assessment 2026.pdf`** — the source of the functional requirements, success criteria, and evaluation metrics.
- **`docs/design-decisions.md`** — the implementation plan and accepted design decisions.
- **GitHub issue [#1: Build the Dispatch Solar Mapping application](https://github.com/adithyab-20/dispatch-solar-mapping/issues/1)** — the implementation specification. Fetch it with `gh issue view 1 --comments`.

If these project documents disagree, identify the exact discrepancy instead of silently choosing one.

## Additional domain documentation

Before exploring an affected area, also read:

- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`** — ADRs touching the area you're about to work in.

If these additional domain files don't exist, **proceed silently**. Don't flag their absence or suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This is a single-context repo:

```text
/
├── Software Engineer Intern - Technical Assessment 2026.pdf
├── CONTEXT.md
├── docs/
│   ├── design-decisions.md
│   └── adr/
│       └── NNNN-<decision>.md
└── src/
```

## Use the glossary's vocabulary when present

If `CONTEXT.md` exists, use its defined term whenever output names a domain concept—for example, in an issue title, refactor proposal, hypothesis, or test name. Don't drift to synonyms the glossary explicitly avoids.

If a needed concept isn't defined there, either reconsider whether you're inventing language the project doesn't use or note a real gap for `/domain-modeling`.

## Flag decision conflicts

If an implementation choice contradicts an existing ADR or `docs/design-decisions.md`, identify the exact discrepancy rather than silently overriding it.
