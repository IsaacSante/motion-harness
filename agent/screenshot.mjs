// Visual verification for the agent's generation loop: capture one
// representative frame of a freshly generated scene and have the (vision-
// capable) model judge it. Deliberately simpler than
// scripts/lib/capture.mjs's deterministic export pipeline — a single frame
// in real time is enough to catch "rendered off-screen" or "doesn't match
// the brief", so there's no need for CDP virtual-time stepping.
import { launchChromium } from '../scripts/lib/capture.mjs';
import { chatCompletion } from './cerebras.mjs';

const CANONICAL_WIDTH = 1920;
const CANONICAL_HEIGHT = 1080;
// Real-time delay after load before screenshotting, long enough for a
// typical entry tween (see defineBeats usage in generated scenes) to
// settle. Not frame-exact — this is a sanity check, not a video export.
const SETTLE_MS = 1500;

export async function captureScenePreview({ previewUrl, sceneName }) {
  const browser = await launchChromium();
  try {
    const ctx = await browser.newContext({ viewport: { width: CANONICAL_WIDTH, height: CANONICAL_HEIGHT } });
    const page = await ctx.newPage();
    await page.goto(`${previewUrl}/?scene=${encodeURIComponent(sceneName)}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(SETTLE_MS);
    const buffer = await page.screenshot({ type: 'png' });
    return buffer.toString('base64');
  } finally {
    await browser.close();
  }
}

export async function judgeScreenshot({ apiKey, model, instruction, sceneName, screenshotBase64 }) {
  const messages = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `This is a screenshot of a generated motion-graphics scene called "${sceneName}", captured ~${SETTLE_MS}ms after it started, rendered at ${CANONICAL_WIDTH}x${CANONICAL_HEIGHT}. It was generated from this instruction:

"${instruction}"

Judge it for two things only:
1. Is everything visible fully inside the ${CANONICAL_WIDTH}x${CANONICAL_HEIGHT} frame — nothing cut off or rendered off-screen?
2. Does it roughly match what the instruction asked for?

Reply with a first line that is EXACTLY "OK" or "ISSUE" and nothing else on that line. If ISSUE, follow with 1-3 short sentences explaining what's wrong, specific enough that a developer could fix it (e.g. "the title text is rendered ~700px to the right of the visible frame, mostly off-screen").`,
        },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotBase64}` } },
      ],
    },
  ];

  const raw = await chatCompletion({ apiKey, model, messages, temperature: 0 });
  const firstLine = (raw.trim().split('\n')[0] ?? '').trim().toUpperCase();
  const ok = firstLine === 'OK';
  return { ok, explanation: ok ? '' : raw.trim() };
}

// Separate from judgeScreenshot on purpose: correctness (off-screen, matches
// the brief) and design quality (spacing, alignment, composition) are
// different questions, judged after correctness is already established —
// a scene can be perfectly on-screen and on-brief while still looking
// arbitrary/uncomposed, which judgeScreenshot was never designed to catch.
export async function judgeDesignQuality({ apiKey, model, instruction, sceneName, screenshotBase64 }) {
  const messages = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `This is a screenshot of a generated motion-graphics scene called "${sceneName}", captured ~${SETTLE_MS}ms after it started, rendered at ${CANONICAL_WIDTH}x${CANONICAL_HEIGHT}. It was generated from this instruction:

"${instruction}"

It's already confirmed correct — nothing is off-screen and it matches the instruction. Now judge it purely on design quality: spacing and breathing room, alignment, visual balance, whether sizes and gaps feel intentional rather than arbitrary. Be a demanding designer, not a lenient one — "technically fine" is not the bar.

Reply with a first line that is EXACTLY "DESIGN_OK" or "DESIGN_ISSUE" and nothing else on that line. If DESIGN_ISSUE, follow with 1-3 short, specific, actionable sentences (e.g. "the subtitle sits flush against the title with no gap — add breathing room between them" or "the element is off-center relative to the frame — recenter it").`,
        },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotBase64}` } },
      ],
    },
  ];

  const raw = await chatCompletion({ apiKey, model, messages, temperature: 0 });
  const firstLine = (raw.trim().split('\n')[0] ?? '').trim().toUpperCase();
  const ok = firstLine === 'DESIGN_OK';
  return { ok, explanation: ok ? '' : raw.trim() };
}
