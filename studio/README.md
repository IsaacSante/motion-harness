# motion-harness studio

A local visual wrapper for the harness: create a new project, arrange its
scenes on a timeline (each scene is a clip — reorder, set its duration
label, edit its config), and preview it live.

v1 is an **arrangement** timeline, not a scrubbable one: it controls scene
order and per-scene config/duration-label, and plays them back sequentially.
Jumping the playhead to an arbitrary point mid-scene isn't supported yet —
that needs a `seek(t)` capability added to the Scene contract itself, which
is a deliberate later step, not an oversight.

## Running it

Two processes, two terminals:

```bash
cd studio
npm install        # first time only
npm run server     # backend on :4310 — project registry, timeline read/write, preview spawning
npm run dev         # frontend on :5173 (proxies /api to :4310)
```

Then open the frontend URL.

## What it does

- **New project** — name + a parent directory. Scaffolds `../template`
  (see the root README), wires up the `motion-harness` dependency with the
  correct relative path, runs `npm install` and `git init` in it.
- **Timeline** — reads/writes that project's `src/timeline.json`. Reorder
  clips by dragging; each clip references a scene by name (from
  `src/scenes/`) plus a duration label and a JSON config blob.
- **Preview** — spawns the selected project's own `vite` dev server as a
  child process on a free port and embeds it in an iframe. Nothing about a
  project's execution runs inside the studio itself — it's just orchestrating
  a separate, ordinary Vite dev server per project.

## Where project state lives

- `server/projects.json` (gitignored) — this machine's registry of known
  projects (name → absolute path). Not portable, not meant to be committed.
- Everything else — timeline, scenes, tokens, config — lives in the
  project's own repo, not in the studio.
