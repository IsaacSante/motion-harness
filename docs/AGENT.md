# Working in a motion-harness project

This project was scaffolded from `motion-harness`. Before writing new motion
code, read `src/catalog/catalog.json` (regenerate with `npm run catalog`) —
it's a flat list of every reusable primitive/motif/layout/effect already in
the kit, with a one-line description. Check it before hand-rolling a tween, a
shader, or a layout helper; most "new" motion needs are a combination of 2-3
existing entries, not a new one.

## Rules

1. **Kit code (`src/`) never encodes brand identity.** No hardcoded colors,
   fonts, or specific visual language — those come from the consuming
   project's own tokens, passed in as parameters. If you're about to put a
   hex color or a font-family string in `src/`, it belongs in the project
   instead.
2. **Pacing goes through `defineBeats`.** Don't hardcode a duration/delay
   inline in a scene if it's a rhythm decision (how long something holds,
   how long a stagger is) — put it in the scene's beat map so the whole
   piece can be retimed by scaling one number.
3. **Compose motion through `createLayeredElement`.** If an element has more
   than one independent thing driving its position/opacity (an entrance, an
   idle drift, a reaction to something else), give it named layers and one
   `apply()` — don't hand-write a function that sums several state objects
   into a transform string. That hand-rolled version is where the same bug
   gets reintroduced on every fresh generation.
4. **When you build something reusable, tag it for the catalog.** Add a
   JSDoc block directly above the export:
   ```ts
   /**
    * @kind motif   // or: layout | effect | primitive | core
    * One line describing what it does and when to reach for it.
    */
   export const myThing = (...) => { ... };
   ```
   Then run `npm run catalog`. Untagged exports don't show up in the catalog
   and won't be found by a future run — if it's genuinely reusable, tag it.
5. **New motion specific to one scene stays in that scene's file.** Don't
   promote something to `src/` on its first use. Promote it once a *second*
   scene wants the same behavior — that's the signal it's actually shared,
   not speculative.
