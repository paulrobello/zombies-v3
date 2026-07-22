# Documentation Style Guide (project-local)

This is the **project-local** supplement to the global documentation style
guide at `~/.claude/DOCUMENTATION_STYLE_GUIDE.md`. The global guide is the
canonical baseline (voice, document types, formatting, code-block conventions,
Mermaid usage, review checklist); this file captures only what is specific to
**zombies-v3**. When the two disagree, the global guide wins on generic
matters and this file wins on project-specific conventions.

## Voice

- Match the existing [README](../README.md): direct, technical, second-person.
  "Run `yarn start`." not "The developer may run `yarn start`."
- Short paragraphs (3–5 lines). The README is the tone reference.
- American English by policy (the codebase uses `behaviors/`, `color`,
  `neighbors`). Do not introduce British spellings.
- Past tense for what shipped; imperative for instructions. "Added strict
  mode." / "Run `make checkall`."

## Document conventions

- Every doc starts with a single H1 title and a one- or two-sentence summary.
- Use a table of contents for any doc over ~500 words or more than three H2
  sections.
- Prefer Mermaid diagrams for architecture, flow, and directory-overview
  graphs. Do not add a diagram that merely restates a list — the README's
  controls table needs no diagram.
- Link relatively between docs (`[toolchain](architecture/toolchain.md)`),
  never via absolute paths or URLs into the repo.
- Avoid line numbers in durable references — they rot. Reference a function,
  file, or symbol name. (Audit findings like `Boid.ts:154` are the exception
  because they are pinned to a specific audit date, not durable docs.)

## Code blocks

- Always specify a language on fenced code blocks (` ```sh `, ` ```ts `,
  ` ```glsl `). The only exception is the directory tree, which uses a plain
  fenced block.
- Shell commands are copy-paste-friendly — no leading `$` or `>` prompts.
- TypeScript examples must type-check under the project's `strict: true`
  `tsconfig.json`. If you can't make an example compile, say so explicitly
  and mark it as pseudocode.

## JSDoc

- Open with `/**` (JSDoc), never `/***` (a plain block comment that tooling
  ignores — see audit DOC-012 for the regression this project had).
- Document the **non-obvious**: the `dest?` mutate-or-return convention on
  `vec2`/`vec4`, the `Boid.behaviors` run-order, the GLSL per-instance
  attribute packing. Don't restate what the type signature already shows.

## Changelog

- The root [`CHANGELOG.md`](../CHANGELOG.md) follows
  [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
- Group entries under `Added` / `Changed` / `Deprecated` / `Removed` /
  `Fixed` / `Security`.
- Reference audit IDs (`ARC-001`, `QA-012`) when the change came from the
  audit — they are the durable cross-reference back to `AUDIT.md`.

## Commit and PR descriptions

This repo uses Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`,
`refactor:`, `perf:`, `test:`, `security:`). Documentation commits should use
`docs(scope):` and call out the audit DOC-NNN ID in the body when relevant.
See [`CONTRIBUTING.md`](../CONTRIBUTING.md) for the full table.

## When to update docs

- **Added/changed behaviour** → README "How it works" and the relevant
  `docs/architecture/` note (when one exists).
- **New or changed control** → README controls table **and** the help panel
  in `src/index.html`. These two have drifted before (audit DOC-015); keep
  them in lockstep.
- **New shader or GL program** → note it under `docs/architecture/` and in
  `CONTRIBUTING.md`'s "How to add a shader" if the workflow changed.
- **Toolchain change** → update `docs/architecture/toolchain.md` and add a
  `CHANGELOG.md` entry.
