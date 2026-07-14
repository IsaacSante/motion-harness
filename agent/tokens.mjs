// Derives a project's first color palette + font stack from its earliest
// scene instruction, so a fresh project doesn't render every scene with the
// same placeholder dark-bg/indigo-accent/system-ui look regardless of what
// was actually asked for. Runs once per project, the moment tokens.ts is
// found to still be the scaffolded placeholder — after that, tokens.ts no
// longer matches the placeholder, so later scenes in the same project reuse
// whatever was derived here instead of re-rolling a palette every time.
import { chatCompletion } from './cerebras.mjs';

// Mirrors template/src/tokens.ts verbatim. Detecting "is this project's
// tokens.ts untouched scaffold output" this way — instead of a separate
// marker file or timestamp — means it keeps working even if the template
// file itself changes, as long as this constant is kept in sync.
export const PLACEHOLDER_TOKENS = `// Placeholder tokens — this is where a project's own visual identity goes.
// Nothing here is meant to survive first contact with a real brief.
export const color = {
  bg: '#0b0c0f',
  fg: '#f4f4f5',
  fgMuted: 'rgba(244, 244, 245, 0.6)',
  accent: '#6366f1',
} as const;

export const type = {
  sans: 'system-ui, -apple-system, sans-serif',
  weight: { regular: 400, medium: 500, semibold: 600 },
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 } as const;
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;
`;

export function isPlaceholderTokens(source) {
  return source.trim() === PLACEHOLDER_TOKENS.trim();
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Only web-safe stacks that render with zero network requests — this
// project has no font-loading pipeline (no <link>, no @font-face), so an
// invented Google Font name would silently fall back to the browser
// default instead of rendering as intended.
const FONT_STACK_CHOICES = [
  { name: 'geometric-sans', stack: "'Futura', 'Century Gothic', system-ui, -apple-system, sans-serif" },
  { name: 'editorial-serif', stack: "Georgia, 'Iowan Old Style', 'Times New Roman', serif" },
  { name: 'technical-mono', stack: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace" },
  { name: 'rounded-friendly', stack: "'SF Pro Rounded', 'Varela Round', system-ui, sans-serif" },
  { name: 'condensed-display', stack: "'Bebas Neue', Oswald, 'Arial Narrow', sans-serif" },
  { name: 'humanist-sans', stack: "Avenir, 'Helvetica Neue', system-ui, sans-serif" },
  { name: 'classic-serif', stack: "Palatino, 'Book Antiqua', Georgia, serif" },
  { name: 'neutral-sans', stack: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
];

function buildPaletteSystemPrompt() {
  const fontList = FONT_STACK_CHOICES.map((f) => `- ${f.name}`).join('\n');
  return `You pick a color palette and font for a motion-graphics scene, based on a brief describing what it should show.

Respond with ONLY a JSON object, no markdown fences, no explanation, shaped exactly like:
{"bg": "#rrggbb", "fg": "#rrggbb", "accent": "#rrggbb", "font": "<one name from the list below>"}

Rules:
- "bg" and "fg" must have strong contrast (this is text/graphics on a background, not a color
  study) — don't default to near-black bg + near-white fg unless the brief actually calls for
  that; a bright, saturated, or midtone bg is often the more interesting and more correct choice.
- "accent" should read clearly against "bg" and fit the brief's mood — don't default to
  indigo/blue unless the brief calls for it.
- Vary your choice with the brief's subject and tone (playful vs. technical vs. editorial vs.
  luxury vs. brutalist, etc). Two briefs with a different mood should not get the same palette.
- "font" must be EXACTLY one of these names (pick whichever fits the brief's tone, not always
  the same one):
${fontList}

Brief:
`;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function buildTokensSource({ bg, fg, accent, fontStack }) {
  const [r, g, b] = hexToRgb(fg);
  return `// Derived from this project's first scene brief — bg/fg/accent/font vary
// per project instead of a single fixed look.
export const color = {
  bg: ${JSON.stringify(bg)},
  fg: ${JSON.stringify(fg)},
  fgMuted: ${JSON.stringify(`rgba(${r}, ${g}, ${b}, 0.6)`)},
  accent: ${JSON.stringify(accent)},
} as const;

export const type = {
  sans: ${JSON.stringify(fontStack)},
  weight: { regular: 400, medium: 500, semibold: 600 },
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 } as const;
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;
`;
}

// Rough WCAG-ish relative luminance contrast check — catches the failure
// mode of the model picking two similar tones (e.g. bg/fg both dark) that
// would render as invisible or near-invisible text. Not full a11y
// compliance, just a sanity floor.
function contrastRatio(hexA, hexB) {
  const luminance = (hex) => {
    const [r, g, b] = hexToRgb(hex).map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [lA, lB] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
  return (lA + 0.05) / (lB + 0.05);
}

// Best-effort, same philosophy as the visual/design checks in
// generate-scene.mjs: a broken or nonsensical palette response must never
// block scene generation. Falls back to the scaffolded placeholder tokens
// (with a warning) rather than failing the whole call — and since that
// leaves tokens.ts matching the placeholder, the next generation in this
// project will simply try deriving a palette again.
export async function derivePaletteTokens({ apiKey, model, instruction }) {
  try {
    const messages = [
      { role: 'system', content: buildPaletteSystemPrompt() },
      { role: 'user', content: instruction },
    ];
    const raw = await chatCompletion({ apiKey, model, messages, temperature: 0.6 });
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no JSON object in response');
    const parsed = JSON.parse(match[0]);

    const { bg, fg, accent, font } = parsed;
    if (![bg, fg, accent].every((v) => typeof v === 'string' && HEX_RE.test(v))) {
      throw new Error(`invalid color(s) in ${JSON.stringify(parsed)}`);
    }
    if (contrastRatio(bg, fg) < 2.5) {
      throw new Error(`bg/fg contrast too low (${JSON.stringify(parsed)})`);
    }
    const fontChoice = FONT_STACK_CHOICES.find((f) => f.name === font);
    if (!fontChoice) {
      throw new Error(`unknown font choice ${JSON.stringify(font)}`);
    }

    return { source: buildTokensSource({ bg, fg, accent, fontStack: fontChoice.stack }), warning: undefined };
  } catch (err) {
    return {
      source: PLACEHOLDER_TOKENS,
      warning: `Couldn't derive a palette from the brief (${err instanceof Error ? err.message : String(err)}); kept the default look.`,
    };
  }
}
