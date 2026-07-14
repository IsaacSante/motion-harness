const toCamel = (sceneName) =>
  sceneName
    .split(/[-_\s]+/)
    .map((part, i) => (i === 0 ? part.toLowerCase() : part[0].toUpperCase() + part.slice(1).toLowerCase()))
    .join('');

export const factoryNameFor = (sceneName) => `${toCamel(sceneName)}Scene`;

export function buildSystemPrompt(ctx, sceneName) {
  const factoryName = factoryNameFor(sceneName);
  // Show the actual signature, not just a prose description — a
  // plausible-sounding guess at parameter order/count/types is not the same
  // as the real thing, and a one-line description alone gives no way to
  // tell the difference (confirmed live: a generated scene guessed a
  // 3-argument signature for the real 5-argument `columnSlots`).
  const catalogLines = ctx.catalog.length
    ? ctx.catalog.map((e) => `- ${e.name}${e.signature ?? ''} (${e.kind}): ${e.description}`).join('\n')
    : '(catalog empty — run `npm run catalog` in the kit)';

  return `You generate a single TypeScript scene file for motion-harness, a motion-graphics kit.

## The Scene contract (src/scene/types.ts)
\`\`\`ts
${ctx.sceneContract}
\`\`\`

## Primitives already available — import from 'motion-harness'. Prefer these over hand-rolled tweens/layout/teardown code:
${catalogLines}

## This project's design tokens — import from '../tokens'
\`\`\`ts
${ctx.tokens}
\`\`\`

## A correctly structured existing scene — for CODE STRUCTURE only (imports, the
## Scene contract's shape, teardown), NOT for what this scene should look like or
## how it should move. Its specific motif and layout choice is one example, not
## the required look — copying it verbatim regardless of brief is wrong exactly
## as often as it's right.
\`\`\`ts
${ctx.exampleScene}
\`\`\`

## Requirements
- Decide motion and composition from THIS instruction, not from habit. The motifs above
  ("motif" kind) are entrance/idle building blocks to compose freely — not a menu where one
  entry is the right pick regardless of brief, and not the only way to move something. Some
  briefs (a receding 3D crawl, a transformation, a wipe) call for hand-driving
  \`createLayeredElement\`'s layer values directly with your own tween rather than reaching for
  any named motif at all — that's correct when none of them fit, not a fallback of last resort.
  If two scenes in this project would end up with the same motif + the same centered layout
  regardless of what their instructions asked for, that's a sign you defaulted instead of
  reasoning about this specific brief.
- Export exactly one factory function named EXACTLY \`${factoryName}\`, shaped like:
  \`export const ${factoryName} = (config: SomeConfig = {}): Scene<SomeConfig> => { ... }\`
- The runtime ALWAYS calls this factory with an explicit config object (e.g. \`{}\`), NEVER
  \`undefined\` — so a top-level default like \`config: SomeConfig = { lines: [] }\` never actually
  applies; JS only falls back to it when the argument itself is \`undefined\`, not when it's an
  object missing that field. If any field's absence would break the scene (e.g. \`config.lines.length\`
  on a missing \`lines\`), default it individually inside the function body instead, e.g.
  \`const lines = config.lines ?? ['fallback text'];\` — never assume a field exists just because
  the type or the top-level default says it should.
- Use \`defineBeats\` for any timing/duration decisions instead of inline magic numbers.
- Use \`createLayeredElement\` instead of hand-summing transforms whenever an element has
  more than one independent thing driving its motion (entry + idle drift + exit, etc). It must
  already be \`position: absolute; left: 0; top: 0\`. To center it, use \`opts.center\` — it
  measures the element for you — rather than hand-computing \`origin\`; see its catalog entry
  above for exactly why (this is the single most common way a scene renders correctly-typed
  but visibly broken, so read that entry, don't guess).
- Always tear down in exit(): kill every tween, remove every DOM node you created. Use
  \`createTeardownBag\` to track them instead of parallel arrays.
- When animating MULTIPLE elements' entrances, set every element's initial \`layers.entry\` state
  (\`Object.assign\` + \`apply()\`) for ALL of them BEFORE starting any of their tweens, and never
  \`await\` one element's entry tween before starting the next one's inside the same loop — an
  element whose turn hasn't come yet still has its layers at their zeroed defaults with \`apply()\`
  never called, so it renders untransformed at the raw DOM position (\`position: absolute; left:
  0; top: 0\`) instead of hidden/off-place at its intended slot — which looks exactly like every
  not-yet-animated element piled on top of each other in the corner. Stagger multiple elements
  with each tween's own \`delay\` (e.g. \`delay: i * 0.1\`), firing every tween up front and tracking
  each with the teardown bag, not by awaiting them one at a time.
- Everything tagged "motif" above is a FACTORY FUNCTION you must CALL, e.g. \`const spec =
  riseFade();\` — never pass the bare function itself anywhere gsap expects an ease, a number,
  or a style value, that's a type error every time. \`floatDrift\`'s return shape is DIFFERENT
  from every other motif's (see its catalog entry above) — don't assume it matches the others.
- This project's tsconfig has \`noUnusedLocals\`/\`noUnusedParameters\` enabled. The reference
  scene above destructures \`enter({ overlay, width, height, transparentBg })\` because it happens
  to use all four — don't copy that whole destructure by habit. Only destructure the \`enter()\`
  fields and declare the loop/callback parameters (e.g. \`.forEach((text, i) => ...)\`) you
  actually reference in the body; an unused one is a typecheck failure, not a warning.
- Output ONLY the raw TypeScript source of the file. No markdown fences, no explanation,
  no commentary before or after the code.`;
}

export function buildRepairMessage(errors) {
  return `Typecheck failed. Fix the code so it typechecks cleanly. Compiler output:

${errors}

Output ONLY the corrected, complete TypeScript file — no explanation, no markdown fences.`;
}

// TS6133 ("declared but its value is never read") is the one failure mode
// with a genuinely mechanical fix — delete the binding or prefix it with
// `_` — yet the generic repair message above leaves the model to reason
// that out from raw compiler output, which is exactly the case observed to
// burn all MAX_ATTEMPTS without ever landing the fix. Naming the fix
// directly removes that ambiguity.
export function buildUnusedVarsRepairMessage(errors) {
  return `Typecheck failed only on unused-variable/parameter errors (TS6133) — this project has
\`noUnusedLocals\`/\`noUnusedParameters\` enabled. For each one below, either delete the unused
declaration, or if it can't be removed without changing a signature, prefix its name with an
underscore instead (e.g. \`i\` -> \`_i\`, or for a destructured field \`height\` -> \`height: _height\`).
Don't change anything else about the file. Compiler output:

${errors}

Output ONLY the corrected, complete TypeScript file — no explanation, no markdown fences.`;
}

// Multimodal repair turn: includes the actual screenshot of what the
// previous attempt rendered, not just a text description of the problem —
// the model can only fix what it can see.
export function buildVisualRepairMessage(explanation, screenshotBase64) {
  return {
    role: 'user',
    content: [
      {
        type: 'text',
        text: `The code typechecks, but this is what it actually rendered — a reviewer found a problem:

${explanation}

Look at the attached screenshot and fix the code so the issue above is gone. Output ONLY the corrected, complete TypeScript file — no explanation, no markdown fences.`,
      },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotBase64}` } },
    ],
  };
}

// Unlike the other repair messages, this asks for targeted find-and-replace
// edits instead of a full-file rewrite. A design pass is a polish operation —
// spacing, alignment, a gap — and regenerating the entire file from scratch
// for that has far more surface area to accidentally break something the
// pass wasn't even trying to touch than editing the specific lines that
// need to change. The current file is embedded directly rather than relied
// on from conversation history so "old" snippets always match the actual
// current state, including edits from any earlier design pass this call.
export function buildDesignRepairMessage(explanation, screenshotBase64, currentCode) {
  return {
    role: 'user',
    content: [
      {
        type: 'text',
        text: `The code is correct and typechecks, but a design reviewer flagged the visual quality of what it rendered:

${explanation}

Current file:
\`\`\`ts
${currentCode}
\`\`\`

Look at the attached screenshot and improve the spacing/alignment/composition so the issue above is resolved, without changing what the scene fundamentally does.

Output ONLY a JSON array of targeted edits against the current file above, each shaped exactly like:
[{ "old": "<exact snippet copied verbatim from the current file, including whitespace/indentation>", "new": "<replacement text>" }]

Rules:
- Each "old" must be copied EXACTLY from the current file above (matching whitespace) and must appear only once in it — this is a find-and-replace, not a line-numbered diff.
- Keep edits as small as they can be while still fixing the issue — a spacing/alignment fix is usually one or two short edits, not a rewrite of the whole enter() body.
- Don't touch anything unrelated to the flagged issue.
- Output ONLY the JSON array — no markdown fences, no explanation.`,
      },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotBase64}` } },
    ],
  };
}
