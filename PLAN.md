# motion-harness — open issues

Checkpoint after the first end-to-end pass: kit → studio → agent loop, all
wired together and exercised against real generations. This is what's known
broken or unverified, for whoever picks this back up next.

## Confirmed bugs

### 1. `createLayeredElement`'s positioning precondition is undocumented
The element passed in must be `position: absolute; left: 0; top: 0`.
`apply()` writes a `transform: translate3d(...)` every frame — CSS
`transform` doesn't remove an element from normal layout flow, it visually
offsets whatever position the element already has. Put a flex-centered
element through it and the offset stacks on top of the existing centering
instead of replacing it. Confirmed live: a generated "MANGO" title in the
`miami` test project rendered ~700px outside a 1470px viewport this way
(`getBoundingClientRect` showed `left: 1131, width: 729` against
`innerWidth: 1470`).

This is worse than a typical bug because **it typechecks clean** — nothing
about it is a type error, so the agent's repair loop (which only runs
`tsc --noEmit`) has no way to catch it. Two fixes, not yet done:
- Add the precondition explicitly to `createLayeredElement`'s JSDoc in
  `src/compose/layered-state.ts` (currently only says it writes "one
  transform/opacity write per frame" — never says the element must be
  absolutely positioned for that to compose correctly).
- Add the same rule to `agent/prompt.mjs`'s system prompt — the exact
  pattern already used for the earlier motif-factory bug (see
  `agent/generate-scene.mjs` / `agent/prompt.mjs` history: motifs like
  `riseFade` are factory functions you must call, not pass around — that
  rule exists in the prompt now; this one doesn't yet).

### 2. Agent success criterion is "typechecks," full stop
Direct consequence of #1: there is currently no way for a generation to be
verified as *visually* correct, only *type* correct. This is a real,
structural gap in `agent/generate-scene.mjs`, not a one-line fix. Ideas, not
started:
- Cheapest partial mitigation: after typecheck passes, spin up the project
  briefly (headless) and assert generated elements' bounding boxes end up
  within stage bounds after their entry settles. Catches gross
  off-screen-ness like the MANGO case; catches nothing about whether it
  actually looks good.
- Real fix would be some form of visual verification (screenshot diff,
  vision-model judge on a captured frame) — meaningfully bigger scope.

### 3. Stray broken scene left in real test projects
`nasa` still has `src/scenes/into.ts` (broken, never fixed) and its
`main.ts` registration from the very first failed generation, before the
repair-loop/success-check bugs were fixed. Not cleaned up — left for a
deliberate decision (delete vs. try regenerating now that both bugs are
fixed) rather than touched unilaterally.

## Untested surface (risk, not confirmed broken)

Most of the kit was proven via typecheck + one simple demo scene
(`demo/scenes/cards-demo.ts`, riseFade + layered-state + beats + layout +
lifecycle bag), not by actually running the more complex pieces:
- `src/gl/program.ts`, `src/gl/particles.ts` — WebGL scaffolding, never
  exercised by any real scene since the kit was extracted.
- `ringSlots`, `reflowRow` (`src/layout/arrange.ts`) — never called by
  anything yet.
- `scalePop`, `expoSettle`, `overshootSpring` — never used in a scene that
  was confirmed to render correctly (the two that *were* exercised,
  `blurMaterialize` and `floatDrift` in the `miami`/`nasa` generations, were
  used inside scenes that had the createLayeredElement bug above, so their
  own correctness in isolation isn't confirmed either).

## No automated tests

Pure functions (`defineBeats`'s scale math, `createLayeredElement`'s layer
composition/summing, `rowSlots`/`ringSlots`/`reflowRow`'s layout math) are
cheap to unit test and currently have zero coverage. Everything verified so
far has been manual (typecheck + browser screenshots).

## Deferred by deliberate decision, not forgotten

- **Scrubbable timeline.** v1 is arrangement-only (reorder/duration-label/
  config, sequential playback) by explicit choice — a true scrubbable
  playhead needs a `seek(t)` capability added to the Scene contract itself,
  a bigger change to make deliberately, not retrofit.
- **Not pushed to `origin`.** 6 local commits ahead of `origin/main` as of
  this checkpoint. Never pushed — needs an explicit ask first.

## Process notes worth remembering

- `gemma-4-31b` (the default Cerebras model in `agent/generate-scene.mjs`)
  is a **preview** model per Cerebras's own docs — eval-only, can change or
  disappear without notice. If generations start failing for no code reason,
  check that first.
- Any change to `agent/*.mjs` or `studio/server/*.mjs` requires restarting
  the studio's backend process (`npm run server`) — Node doesn't hot-reload
  `.mjs` files, and this has already caused one confusing "the fix didn't
  work" false alarm this session.
