# __PROJECT_NAME__

Scaffolded from motion-harness. This project's own data — tokens, scenes,
timeline — lives in `src/` and is yours to edit freely.

## Rules

1. **Never edit anything under `node_modules/motion-harness`.** It's a
   `file:` dependency (symlinked), i.e. the shared kit, not a copy. Changes
   there silently affect every other project depending on it. If something
   needs to change in the kit itself, do it in the motion-harness repo.
2. **Before writing new motion code**, check
   `node_modules/motion-harness/src/catalog/catalog.json` (or
   `node_modules/motion-harness/docs/AGENT.md`) for an existing
   primitive/motif/layout/effect before hand-rolling a tween, shader, or
   layout helper.
3. **Adding a new scene**: create `src/scenes/<name>.ts` exporting a
   `SceneFactory`, then register it in `sceneRegistry` in `src/main.ts`.
   `src/timeline.json` clips reference scenes by that registry key.
4. **`src/timeline.json`** is arrangement data — clip order, duration
   labels, per-scene config — normally edited through the motion-harness
   studio UI, but it's plain JSON if you ever need to hand-edit it.
