# motion-harness

A brief-agnostic kit for agent-generated motion graphics: the architecture
that generalizes across any commercial-style animation project, stripped out
of a real one (`motion`) where six hand-built scenes kept reinventing the
same few patterns — three of them (search/newsearch/softsearch) were full
independent rewrites of the same UX beat because there was no shared library
and no way to discover it. This kit is the fix: primitives an agent can find
and reuse instead of regenerating.

## What's in here, and why

- **`src/scene/`** — the `Scene`/`SceneCtx` contract, `SceneManager`,
  and the rAF loop. Already brief-agnostic in the source project; promoted
  as-is.
- **`src/beats/`** — named-duration pacing (`defineBeats`), so a scene's
  rhythm is one object you can globally retime instead of scattered magic
  numbers.
- **`src/compose/`** — `createLayeredElement`, the single-writer pattern
  that composes independent motion layers (entry / idle drift / exit /
  reaction) into one transform+opacity write per frame. Every source scene
  reinvented this by hand, slightly differently, every time.
- **`src/motifs/`** — a small vocabulary of entrance/exit/drift archetypes
  (`riseFade`, `scalePop`, `blurMaterialize`, `expoSettle`,
  `overshootSpring`, `floatDrift`) expressed as plain numeric deltas + an
  ease string — no color, no font, no visual identity.
- **`src/layout/`** — pure arrangement math (`rowSlots`, `ringSlots`,
  `reflowRow`), no DOM opinions.
- **`src/gl/`** — shader compile/link boilerplate and a generic point-sprite
  particle buffer, factored out of the source project's four independent
  copies of the same WebGL scaffolding.
- **`src/lifecycle/`** — `createTeardownBag`, replacing the repeated
  "kill tweens, fade root, dispose resources, remove root" block every scene
  wrote by hand.
- **`src/catalog/catalog.json`** — generated manifest of every `@kind`-tagged
  export (see `docs/AGENT.md`). The point isn't just that the library
  exists — it's that an agent can cheaply discover what's already there
  before writing something new.

## What's deliberately NOT in here

Nothing about liquid glass, a specific palette, typography, or any other
visual identity. That's brief-specific and lives in the *consuming* project's
own tokens file, passed into the kit's primitives as plain parameters.

## Starting a new project

Projects depend on this kit as a local package (`file:` dependency, resolved
as a symlink) rather than forking its source — the kit stays a single shared
copy, project data (tokens, scenes, timeline) stays in the project's own repo.

```bash
npm run create-project -- <name> <parent-dir>
```

This scaffolds `template/` into `<parent-dir>/<name>`, wires up the
`motion-harness` dependency with the correct relative path, and runs
`npm install` + `git init` in it. See `template/CLAUDE.md` for the rules a
new project's own agent should follow (most importantly: never edit
`node_modules/motion-harness` — that's the shared kit, not project code).

The same scaffolding is exposed through a visual UI — see `studio/README.md`
— which also gives each project a timeline (its scenes as reorderable clips)
and a live preview.

## Commands

```bash
npm install
npm run dev              # demo at demo/ — one scene proving the pieces compose
npm run typecheck
npm run catalog           # regenerate src/catalog/catalog.json
npm run create-project    # scaffold a new project from template/
```

See `docs/AGENT.md` for the rules an agent should follow when extending this
kit or a project built on it.
