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

## A correctly structured existing scene, for style/shape reference
\`\`\`ts
${ctx.exampleScene}
\`\`\`

## Requirements
- Export exactly one factory function named EXACTLY \`${factoryName}\`, shaped like:
  \`export const ${factoryName} = (config: SomeConfig = {}): Scene<SomeConfig> => { ... }\`
- Use \`defineBeats\` for any timing/duration decisions instead of inline magic numbers.
- Use \`createLayeredElement\` instead of hand-summing transforms whenever an element has
  more than one independent thing driving its motion (entry + idle drift + exit, etc). It must
  already be \`position: absolute; left: 0; top: 0\`. To center it, use \`opts.center\` — it
  measures the element for you — rather than hand-computing \`origin\`; see its catalog entry
  above for exactly why (this is the single most common way a scene renders correctly-typed
  but visibly broken, so read that entry, don't guess).
- Always tear down in exit(): kill every tween, remove every DOM node you created. Use
  \`createTeardownBag\` to track them instead of parallel arrays.
- Everything tagged "motif" above is a FACTORY FUNCTION you must CALL, e.g. \`const spec =
  riseFade();\` — never pass the bare function itself anywhere gsap expects an ease, a number,
  or a style value, that's a type error every time. \`floatDrift\`'s return shape is DIFFERENT
  from every other motif's (see its catalog entry above) — don't assume it matches the others.
- Output ONLY the raw TypeScript source of the file. No markdown fences, no explanation,
  no commentary before or after the code.`;
}

export function buildRepairMessage(errors) {
  return `Typecheck failed. Fix the code so it typechecks cleanly. Compiler output:

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

// Same multimodal shape as buildVisualRepairMessage, worded for design-
// quality refinement rather than correctness — the scene already works,
// this is a polish pass, so it explicitly says not to change behavior.
export function buildDesignRepairMessage(explanation, screenshotBase64) {
  return {
    role: 'user',
    content: [
      {
        type: 'text',
        text: `The code is correct and typechecks, but a design reviewer flagged the visual quality of what it rendered:

${explanation}

Look at the attached screenshot and improve the spacing/alignment/composition so the issue above is resolved, without changing what the scene fundamentally does. Output ONLY the corrected, complete TypeScript file — no explanation, no markdown fences.`,
      },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotBase64}` } },
    ],
  };
}
