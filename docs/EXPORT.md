# Exporting a project to video

Renders a scaffolded project's timeline to a transparent (or solid) ProRes
`.mov`, suitable for dropping straight into FCP/Premiere.

## Prerequisites

- `npx playwright install chromium` once, after `npm install` at the
  motion-harness repo root (downloads a Chromium build — not needed by
  scaffolded projects themselves, only by this repo's exporter and the
  agent's visual-check step).
- `ffmpeg` on `PATH` (not an npm dependency — `brew install ffmpeg` or
  equivalent).

## How to run

```
node scripts/export.mjs --project=/path/to/your/project
```

or, from the motion-harness repo:

```
npm run export -- --project=/path/to/your/project
```

Flags (all optional except `--project`):
- `--duration=` seconds; defaults to the sum of the project's
  `src/timeline.json` clip durations
- `--fps=24`
- `--w=3840 --h=2160` (4K)
- `--designWidth=1920` — the logical viewport the project lays out at;
  output resolution is reached via `deviceScaleFactor`, so CSS/vw/vh/fonts
  see the same viewport as the studio preview
- `--solid` — opaque ProRes 422 instead of transparent ProRes 4444
- `--out=<project>/out`
- `--name=output`
- `--no-mov` — skip the ffmpeg encode, PNG sequence only
- `--no-frames` — skip rendering, re-encode existing PNGs

Outputs land in `<out>/`:
- `frames/frame_NNNNN.png` — RGBA, lossless
- `output.mov` — ProRes 4444 (`yuva444p10le`, 10-bit alpha) or, with
  `--solid`, ProRes 422 HQ (`yuv422p10le`)

## What's wired up

```
scripts/export.mjs               the CLI runner — spawns the project's dev
                                  server, drives capture, shells to ffmpeg
scripts/lib/dev-server.mjs        spawn/wait-for-ready/kill for `npm run dev`,
                                  shared with the studio server and the
                                  agent's visual-check step
scripts/lib/capture.mjs           Playwright launch args + the deterministic
                                  CDP virtual-time capture loop

template/src/main.ts              reads ?export=1/?solid=1, defers
                                  manager.play() and exposes
                                  window.__motion = { manager, start() } so
                                  the exporter can start scenes from a
                                  paused virtual clock at t=0. Also reads
                                  ?scene=<name> to render one scene alone
                                  instead of the timeline.
template/index.html               html.export → transparent background
```

## How the pipeline works

1. Launch Chromium with `--default-background-color=00000000` so
   compositing has alpha (full `channel: 'chromium'` build — the
   `chrome-headless-shell` binary rejects that flag).
2. Override the page's background via
   `Emulation.setDefaultBackgroundColorOverride` — the launch flag alone
   isn't enough via raw CDP capture.
3. Pause virtual time (`Emulation.setVirtualTimePolicy({ policy: 'pause' })`)
   before navigating, so the page boots on a frozen clock.
4. Boot phase: advance virtual time up to 30s with
   `pauseIfNetworkFetchesPending` so Vite modules/fonts finish on real-time
   network. Wait for `window.__motion` and `document.fonts.ready`.
5. Re-pause, call `window.__motion.start()` fire-and-forget (awaiting it
   would deadlock — `manager.play()` only resolves once animations finish,
   which they can't on a paused clock).
6. Capture loop: screenshot first (frame 0 at virtual t=0), then
   `advance(frameMs)`, repeat — captures the true initial state, then each
   subsequent frame at exactly `N * frameMs`.
7. Encode: ffmpeg reads the PNG sequence into ProRes with alpha.

This is the same technique as an earlier prototype
(`~/Documents/GitHub/motion`), adapted for motion-harness's project shape.
One thing deliberately **not** ported: that prototype deletes
`Element.prototype.animate` in export mode to force Motion (framer-motion)
off Chrome's WAAPI compositor thread, which ignores the mocked clock.
motion-harness scenes tween through GSAP's own rAF-driven ticker, never
native `Element.animate()`, so the mocked clock already applies with no
extra steps — if a future scene ever calls native WAAPI directly, this would
need revisiting.

## Making a scene transparent-export-safe

`SceneCtx.transparentBg` is `true` only when exporting without `--solid`.
A scene that unconditionally paints an opaque background defeats the alpha
channel even though the page itself is transparent — branch on it instead:
`overlay.style.background = transparentBg ? 'transparent' : color.bg;`
(see `template/src/reference-scene.ts`, which every scaffolded project has).
Any other DOM element or canvas fill that paints full-bleed should follow
the same branch. Scenes that don't care about export can ignore
`transparentBg` entirely — it defaults to `false` in normal (non-export)
playback.

## Common gotchas

- **Existing scaffolded projects predate this.** Projects created before
  this feature landed (their `template/` snapshot is older) don't have the
  `?export=1`/`?scene=` wiring in their own `src/main.ts` — re-scaffold or
  hand-patch them.
- **Scene `exit()` doesn't run.** `manager.play()` awaits each scene's
  `enter()` in sequence; to capture an exit animation, extend the requested
  `--duration` past the last clip's hold, or queue a trailing clip.
- **Port collisions.** The exporter picks a random ephemeral port; rerun if
  it happens to collide with something already listening.
