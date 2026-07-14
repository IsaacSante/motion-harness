# motion-harness — open issues

Checkpoint after the first end-to-end pass: kit → studio → agent loop, all
wired together and exercised against real generations. This is what's known
broken or unverified, for whoever picks this back up next.

## Confirmed bugs

### 1. `createLayeredElement`'s positioning precondition — fixed
The element passed in must be `position: absolute; left: 0; top: 0`.
`apply()` writes a `transform: translate3d(...)` every frame — CSS
`transform` doesn't remove an element from normal layout flow, it visually
offsets whatever position the element already has. Put a flex-centered
element through it and the offset stacks on top of the existing centering
instead of replacing it. Confirmed live: a generated "MANGO" title in the
`miami` test project rendered ~700px outside a 1470px viewport this way
(`getBoundingClientRect` showed `left: 1131, width: 729` against
`innerWidth: 1470`).

Fixed: the precondition is now documented on `createLayeredElement`'s JSDoc
in `src/compose/layered-state.ts`, and the same rule is now in
`agent/prompt.mjs`'s system prompt Requirements list, same style as the
existing motif-factory rule. `miami`/`nasa` themselves are untouched (see #3)
— this only prevents the bug in future generations.

### 2. Agent success criterion is "typechecks," full stop — mitigated
There are now two more gates beyond typecheck, both in
`agent/generate-scene.mjs`, both real (confirmed live against an actual
`CEREBRAS_API_KEY` — see the runs below, not just read-through):

- **Correctness check.** Once a scene typechecks clean, it's rendered
  headlessly (`agent/screenshot.mjs`, Playwright, real time — not the
  deterministic export pipeline, a single settled frame is enough), and the
  model (`gemma-4-31b`, assumed vision-capable) judges the screenshot against
  "is everything inside the frame" and "does it match the instruction." An
  `ISSUE` verdict feeds back into the same repair loop as a typecheck
  failure, image included (`buildVisualRepairMessage`), consuming one of
  `MAX_ATTEMPTS` (3). **Confirmed working, not just plumbed**: a real run
  against an empty test project caught a genuine off-screen render (a
  full-viewport self-centering element that ALSO got an origin offset from
  `createLayeredElement`, double-positioning it out of frame — a different
  variant of bug #1, not prevented by the #1 prompt fix) and correctly
  returned `success: false` after 3 attempts instead of silently reporting
  success.
- **Design-quality passes.** `judgeScreenshot` only ever checked the two
  things above — never spacing, alignment, or composition, so "renders
  correctly but looks arbitrary" sailed through untouched. Once correctness
  is confirmed (not fail-open-skipped), `runDesignPasses` spends up to
  `MAX_DESIGN_PASSES` (2) additional passes — separate budget, on top of the
  3 above, so a stubborn correctness fix can't eat the polish budget — asking
  a second judge (`judgeDesignQuality`, "be a demanding designer") to flag
  spacing/balance/composition issues and repairing against the flagged
  screenshot (`buildDesignRepairMessage`). Each pass re-verifies BOTH
  typecheck and correctness before accepting the edit; a design "improvement"
  that regresses either one is reverted and refinement stops early rather
  than continuing on a worse version.

One request in flight at a time, process-wide: `agent/cerebras.mjs`'s
`chatCompletion` now queues behind a shared promise chain rather than firing
freely. A single `generateScene()` call was always sequential internally
(every request already `await`ed before the next), so this mainly guards
against *cross-request* concurrency — the studio server handles each
incoming HTTP request independently, so two overlapping "generate" calls (two
tabs, a double-click) previously interleaved their Cerebras requests. Rate
limiting was hit repeatedly this session (correctness + design-quality
checks each add their own request per attempt, so one generation can burn
8-10+ requests) — this doesn't reduce request *volume*, only guarantees they
never overlap. If limiting persists after this, next step is real
retry-with-backoff on 429s (not implemented — currently every check still
fails open on any error, 429 included).

Known limitations, not further scoped yet:
- The settle delay before screenshotting is a fixed ~1.5s real-time wait,
  not derived from the scene's actual `defineBeats` timing — good enough for
  "does this look basically right," not frame-accurate.
- Every vision-judge call (correctness AND design) fails **open**: any error
  (dev server didn't boot, API error) is caught and reported as a skipped
  check via a `warning`, not a hard failure.
- `gemma-4-31b` is a Cerebras **preview** model (see process notes) — if
  generation or design quality seems consistently weak, try `gpt-oss-120b`
  (pass `model: 'gpt-oss-120b'` to `generateScene`) before assuming the
  judge/repair-loop logic itself is at fault. Not yet tried.
- Each judge call is one screenshot, one angle, no adversarial re-check —
  a design pass can also just be wrong (a lenient or overly harsh call),
  there's no second opinion.

### 3. Stray broken scenes / stale test projects — moot, all projects deleted
All previously-registered projects (`cars`, `nasa`, `miami`, `test-isaac`,
`sassy`) were deleted at the user's request to start clean —
`/Users/isaac/motion-harness-projects/` and
`studio/server/projects.json` are both empty. Whoever picks this up next is
starting from an actually-clean slate; the old "stray `nasa` scene" bug this
section used to describe no longer exists because the project doesn't.

### 4. Prompt taught two more real bugs, both fixed
Two more confirmed-live cases of the same underlying pattern: the *pipeline*
(typecheck → correctness → design passes) worked exactly as designed — caught
both — but the model couldn't self-correct within budget because our own
system prompt was actively wrong, not just incomplete.

- **`origin.x` double-offset.** An element given `width: '100%'` +
  `textAlign: 'center'` (already horizontally centered) that ALSO got
  `origin: { x: width / 2, ... }` in `createLayeredElement` shifts an EXTRA
  half-viewport-width right, pushing it off-screen — confirmed live, a
  generated "ARTEMIS III" title was cut off at the right edge, failed all 3
  repair attempts because the prompt never said not to combine the two.
  Fixed: `agent/prompt.mjs` now has an explicit "pick exactly one positioning
  mechanism per axis" rule, and `template/src/reference-scene.ts` (the
  example the agent imitates on a project's first generation) was rewritten
  to actually demonstrate the correct pairing — it previously demonstrated an
  unrelated, incomplete pattern that didn't itself trigger the bug but didn't
  prevent the model from combining it with self-centering CSS either.
  Re-verified after the fix: a fresh "mission title card" generation
  consistently paired `width: '100%'` + `textAlign: 'center'` with
  `origin.x: 0` and rendered correctly.
- **`floatDrift`'s return shape misdocumented.** The prompt's motif-usage
  rule told the model ALL motifs including `floatDrift` return a flat
  `{ from, to, duration, ease }` — true for `riseFade`/`scalePop`/
  `blurMaterialize`/`expoSettle`/`overshootSpring`, false for `floatDrift`,
  which returns `{ x: { to, duration, ease }, y: { to, duration, ease } }`
  (no `.from`, per-axis, since it's an infinite yoyo not a finite tween).
  Confirmed live: `driftSpec.x as number` (TS2352 — object cast to number,
  correctly rejected by the compiler) after 3 failed repair attempts, because
  the model was following an instruction that was simply wrong for this one
  motif. Fixed: `agent/prompt.mjs` now documents `floatDrift`'s actual shape
  as an explicit exception, with a concrete two-separate-tweens-per-axis
  example. Manually repaired the one real scene this had broken
  (`new-test/src/scenes/new-nasa.ts`) to confirm the corrected pattern
  typechecks.

Neither of these needed a different/better model — `gemma-4-31b` was doing
exactly what it was told; what it was told was wrong. Worth remembering
before reaching for `gpt-oss-120b`: check whether the system prompt itself is
accurate first, since a stronger model following the same wrong instructions
would eventually hit the same wall.

### 5. Hardened the kit's API instead of further growing the prompt's rule list
Every fix in #4 (and #1) was "add a paragraph to `agent/prompt.mjs` the agent
must remember and correctly apply" — doesn't scale, the rule list only
grows. Audited `src/` for where the API itself *invites* a mistake a prose
rule is currently the only thing preventing, and hardened those instead:

- **Found the propagation mechanism that's supposed to prevent exactly this
  was itself silently broken.** `src/catalog/catalog.json` is generated from
  primitives' own `@kind`-tagged JSDoc and read into the system prompt — the
  "push the rule to the primitive's source, auto-propagate" path. It only
  propagates if someone remembers to run `npm run catalog` after an edit;
  I'd added the `createLayeredElement` precondition to its JSDoc earlier
  today and never regenerated it — the catalog was stale, missing that text
  entirely, the whole session. Fixed the mechanism itself, not just the
  symptom: `scripts/lib/catalog.mjs` extracts the generation logic;
  `agent/context.mjs` now builds the catalog LIVE from the kit's actual
  current source on every generation (`kitRoot` is a `file:` symlink, so this
  is real-time) instead of reading the file. `catalog.json` on disk still
  exists and is still regenerated via `npm run catalog`, but only for humans
  browsing it — the agent can't be desynced from it again.
- **`createLayeredElement` gained a `center` option** (`src/compose/layered-state.ts`)
  that measures the element's own `getBoundingClientRect()` and computes the
  correct origin offset — replaces both the CSS-self-centering-plus-origin
  double-offset AND the eyeball-a-pixel-offset approaches with one measured,
  correct mechanism. `template/src/reference-scene.ts` updated to use it.
- **Added `columnSlots`** (`src/layout/arrange.ts`, mirrors `rowSlots`) —
  there was no vertical-stack layout primitive at all, which is *why*
  generated scenes hand-picked magic-number offsets for title/subtitle/badge
  stacks: there was no real tool for the single most common composition
  pattern. Takes a real `gap` parameter so a `space` token is the natural
  choice instead of a free-typed pixel number.
- **`floatDrift`'s JSDoc strengthened** (`src/motifs/entrances.ts`) with its
  exact shape, a concrete two-tweens-per-axis example, and explicit
  sequencing guidance (start only after entry completes) — deliberately NOT
  wrapped in a GSAP-calling helper; the shape difference is inherent to what
  floatDrift does (mismatched per-axis periods can't collapse into one flat
  spec), and the type system already correctly rejects misuse (that's how
  bug #4 was caught) — this one was correctly a documentation gap, not an
  API gap.
- `agent/prompt.mjs`'s Requirements list shrunk accordingly — full detail
  now lives once, at the primitive's own JSDoc, with a short pointer in the
  prompt instead of a duplicated paragraph that can drift out of sync (as
  the catalog itself just had).
- **Not touched**: `src/gl/*` — no evidence of misuse yet (never exercised by
  a real scene, per the untested-surface note below); hardening it now would
  be guessing at a failure mode, the opposite of this audit's method (every
  change above traces to a confirmed, live-reproduced bug).

Verified live, not just by reading: a fresh generation
(`harden-test/src/scenes/launch-card.ts`, a 3-element vertical title stack
with idle drift — deliberately similar to the bugs that motivated this)
used `columnSlots(..., space.xl, 0)` unprompted with a real token as the
gap, `center: slots[i]` per element, and correctly-sequenced per-axis
`floatDrift` tweens delayed until after entry completes — screenshot
confirmed clean, evenly-spaced, fully-on-screen composition. Nobody told it
to use any of these in this specific instruction; it reached for them
because they were the obvious tools in the catalog.

### 6. ...and immediately found the same class of gap one level deeper
Next real generation (`space/src/scenes/space.ts`) called the brand-new
`columnSlots` with a plausible-but-wrong invented signature —
`columnSlots(3, { cx: width/2, cy: height/2 }, space.xl)`, 3 args bundling
cx/cy into a point object — instead of the real `columnSlots(n, cx, cy, h,
gap)`, 5 flat args. It understood the *purpose* correctly, just guessed the
*shape* wrong, because the catalog only ever showed it a one-line prose
description, never the actual signature — exactly the same "prose is the
only thing preventing a mistake" problem as #5, just aimed at the catalog's
own entries instead of `agent/prompt.mjs`'s Requirements list. This risk was
already latent for `rowSlots`/`ringSlots`/`reflowRow` too (also
signature-free prose, also never yet called by anything), it just took
`columnSlots` getting real usage to surface it.

Fixed at the mechanism, not the instance: `scripts/lib/catalog.mjs` now
extracts each primitive's actual TypeScript signature from source (hand-
rolled paren-balancing, not a full parser — regex can't reliably match
balanced brackets) and every catalog entry carries it. `agent/prompt.mjs`'s
catalog listing now shows `- columnSlots(n: number, cx: number, cy: number,
h: number, gap: number): Point[] (layout): ...` instead of just the prose —
for every primitive, not only the one that got hit. One real wrinkle worth
knowing if this needs touching again: return-type extraction has to branch
on `const` (arrow, always followed by `=>`) vs `function` (never has an
inline object return type in this codebase, so stop at the first bare `{`)
— a naive "stop at first `{`" broke `floatDrift`'s inline `{ x: DriftAxis;
y: DriftAxis }` return type, truncating it mid-type. Manually fixed the
user's `space.ts` (`columnSlots(3, width/2, height/2, 0, space.xl)`,
`h: 0` since these are text elements with no meaningful slot-height) and
attached it to `space`'s timeline.

## Export pipeline — verified end-to-end

`scripts/export.mjs` (+ `scripts/lib/capture.mjs`, `scripts/lib/dev-server.mjs`)
ports the deterministic Playwright+CDP+ffmpeg capture pipeline from an
earlier prototype (`~/Documents/GitHub/motion`) — see `docs/EXPORT.md` for
how it works and why. `template/src/main.ts`/`index.html` carry the
`?export=1`/`?scene=` query-param contract this depends on. Actually run
against a real scaffolded project, not just read-through: confirmed correct
output resolution, correct duration, and genuine alpha
(`ffprobe` showed `yuva444p12le`, corner pixel `00 00 00 00`) — after fixing
a real bug this surfaced, not a pre-existing one: `template/src/scenes/example.ts`
(now `template/src/reference-scene.ts`, see below) painted an opaque
background unconditionally, which would have silently produced a fully
opaque "transparent" export for every project until a scene actually
branches on `SceneCtx.transparentBg`.
- Requires `npx playwright install chromium` (one-time browser download,
  done in this environment) and `ffmpeg` on `PATH` (confirmed present at
  `/opt/homebrew/bin/ffmpeg` on this machine, not guaranteed elsewhere).
- The agent's visual-check step (`agent/screenshot.mjs`) depends on the same
  `?scene=` wiring and HAS been run against a real `CEREBRAS_API_KEY` — see
  bug #2 above.

## New projects no longer scaffold with a placeholder scene

`template/src/timeline.json` starts as `{"clips": []}` — a fresh project's
preview is blank until you actually generate something, not the old
`example` clip whose default text was literally "New scene" (which read as
"is something already here?" confusion). The old `example.ts` moved to
`template/src/reference-scene.ts` (not under `src/scenes/`, never registered
in `sceneRegistry`, never selectable in the Inspector) — it exists solely so
`agent/context.mjs` has a correctly-shaped, project-idiomatic example for a
project's very first generation; once a project has a real generated scene,
`buildContext()` prefers that instead.

## Studio infra bugs found and fixed this session

- **Orphaned preview dev-servers surviving a backend restart.** Killing the
  studio backend (`pkill` → `SIGTERM`) didn't clean up the per-project Vite
  dev servers it had spawned — only `SIGINT` was handled. On restart, the
  port counter reset to the same starting value the orphan was still
  squatting on, and `startDevServer` silently resolved "success" after a
  timeout even when the process never actually became ready. Net effect:
  a preview could silently point at a *different, stale* project's server
  and nobody could tell. Fixed: `scripts/lib/dev-server.mjs` now rejects on
  real failure and auto-retries on the next port
  (`startDevServerOnAvailablePort`), and `studio/server/index.mjs` handles
  `SIGTERM` too.
- **`vite dev` auto-opening a real browser tab on every background spawn.**
  `template/vite.config.ts` had `server: { open: true }` — fine for the
  original single-project prototype this was ported from, wrong here, since
  the studio spawns a project's dev server automatically the instant it's
  selected (before you've clicked anything) and again for every
  export/visual-check run. Removed.
- **Preview never restartable.** Most generated scenes are a few seconds
  with no loop; once playback finished the embedded preview just sat there
  with nothing to watch and no way to replay short of a manual page reload.
  Added a "↺ Restart preview" button (`studio/src/App.tsx`/`ScaledPreview.tsx`,
  remounts the iframe via a key bump — can't just call
  `iframe.contentWindow.location.reload()`, the preview is a different
  origin/port than the studio itself). Save and the auto-attach-after-generate
  flow now also auto-restart the preview.
- **Auto-attach not actually saved.** Generating a new scene attached it to
  the timeline only in React state, not to `timeline.json` on disk — since
  the live preview reads the file, not the state, this silently did nothing
  visible until you happened to click Save. Fixed: `onGenerated` in
  `App.tsx` now saves immediately.

## Untested surface (risk, not confirmed broken)

Most of the kit was proven via typecheck + one simple demo scene
(`demo/scenes/cards-demo.ts`, riseFade + layered-state + beats + layout +
lifecycle bag), not by actually running the more complex pieces:
- `src/gl/program.ts`, `src/gl/particles.ts` — WebGL scaffolding, never
  exercised by any real scene since the kit was extracted.
- `ringSlots`, `reflowRow`, `columnSlots` (`src/layout/arrange.ts`, the last
  one new this session) — `rowSlots`-equivalent `columnSlots` was confirmed
  live (`harden-test/src/scenes/launch-card.ts`); `ringSlots`/`reflowRow`
  still never called by anything.
- `expoSettle`, `overshootSpring` — still never used in a scene confirmed to
  render correctly. `scalePop`, `riseFade`, `floatDrift`, `blurMaterialize`
  ARE now confirmed correct in isolation (`launch-card.ts` render, screenshot-
  verified — see #5).

## No automated tests

Pure functions (`defineBeats`'s scale math, `createLayeredElement`'s layer
composition/summing, `rowSlots`/`ringSlots`/`reflowRow`/`columnSlots`'s
layout math) are cheap to unit test and currently have zero coverage. Everything verified so
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
