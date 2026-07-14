const toCamel = (sceneName) =>
  sceneName
    .split(/[-_\s]+/)
    .map((part, i) => (i === 0 ? part.toLowerCase() : part[0].toUpperCase() + part.slice(1).toLowerCase()))
    .join('');

export const factoryNameFor = (sceneName) => `${toCamel(sceneName)}Scene`;

export function buildSystemPrompt(ctx, sceneName) {
  const factoryName = factoryNameFor(sceneName);
  const catalogLines = ctx.catalog.length
    ? ctx.catalog.map((e) => `- ${e.name} (${e.kind}): ${e.description}`).join('\n')
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
  more than one independent thing driving its motion (entry + idle drift + exit, etc).
- Always tear down in exit(): kill every tween, remove every DOM node you created. Use
  \`createTeardownBag\` to track them instead of parallel arrays.
- Everything tagged "motif" above (riseFade, scalePop, blurMaterialize, expoSettle,
  overshootSpring, floatDrift) is a FACTORY FUNCTION, not a value. You must CALL it —
  e.g. \`const spec = riseFade();\` — then read \`spec.from\`, \`spec.to\`, \`spec.duration\`,
  \`spec.ease\` (a string) off the returned object. Never pass the bare function itself
  (e.g. \`ease: riseFade\`) anywhere gsap expects an ease, a number, or a style value —
  that is a type error every time.
- Output ONLY the raw TypeScript source of the file. No markdown fences, no explanation,
  no commentary before or after the code.`;
}

export function buildRepairMessage(errors) {
  return `Typecheck failed. Fix the code so it typechecks cleanly. Compiler output:

${errors}

Output ONLY the corrected, complete TypeScript file — no explanation, no markdown fences.`;
}
