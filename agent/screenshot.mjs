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
// A generated scene's actual duration isn't knowable from outside without
// either parsing its free-form defineBeats() config (unreliable — key names
// are chosen per-scene) or instrumenting the kit's playback lifecycle (a
// bigger change than this warrants). So instead of guessing one instant to
// screenshot, take three across a fixed real-time window and show the judge
// all of them at once, each labeled with its timecode — it can then tell
// "still animating in, that's fine" from "genuinely stuck/broken" using the
// same kind of before/after context a human reviewer would use. Confirmed
// live: a single early frame of a 15s off-screen-to-on-screen crawl read as
// "blank black screen" 3 attempts in a row even though the code was correct
// — the crawl just hadn't scrolled into view yet at that one instant.
// FRAME_TIMES_MS[2] (10s) is a generous "well into it" checkpoint, not
// necessarily the scene's literal end — good enough to distinguish a slow
// build from something actually stuck.
const FRAME_TIMES_MS = [1000, 5000, 10000];
const FRAME_LABELS = ['t=1s', 't=5s', 't=10s'];
// Each frame is downscaled before compositing — three full-canonical-res
// frames stacked would be an unnecessarily large image to send a vision
// model for what's a structural/timing judgment, not a pixel-detail one.
const COMPOSITE_SCALE = 0.5;

async function compositeWithTimecodes(page, frames) {
  return page.evaluate(async ({ frames, width, height, scale }) => {
    const images = await Promise.all(frames.map((f) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = `data:image/png;base64,${f.base64}`;
    })));

    const frameW = Math.round(width * scale);
    const frameH = Math.round(height * scale);
    const labelH = 36;
    const canvas = document.createElement('canvas');
    canvas.width = frameW;
    canvas.height = (labelH + frameH) * images.length;
    const ctx = canvas.getContext('2d');

    images.forEach((img, i) => {
      const y = i * (labelH + frameH);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, y, frameW, labelH);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText(frames[i].label, 12, y + labelH / 2);
      ctx.drawImage(img, 0, y + labelH, frameW, frameH);
    });

    return canvas.toDataURL('image/png').split(',')[1];
  }, { frames, width: CANONICAL_WIDTH, height: CANONICAL_HEIGHT, scale: COMPOSITE_SCALE });
}

export async function captureScenePreview({ previewUrl, sceneName }) {
  const browser = await launchChromium();
  try {
    const ctx = await browser.newContext({ viewport: { width: CANONICAL_WIDTH, height: CANONICAL_HEIGHT } });
    const page = await ctx.newPage();
    await page.goto(`${previewUrl}/?scene=${encodeURIComponent(sceneName)}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    const frames = [];
    let elapsed = 0;
    for (let i = 0; i < FRAME_TIMES_MS.length; i++) {
      await page.waitForTimeout(FRAME_TIMES_MS[i] - elapsed);
      elapsed = FRAME_TIMES_MS[i];
      const buffer = await page.screenshot({ type: 'png' });
      frames.push({ base64: buffer.toString('base64'), label: FRAME_LABELS[i] });
    }

    const composite = await compositeWithTimecodes(page, frames);
    return composite;
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

Some scenes have a deliberately slow-building intro (e.g. a scrolling crawl that starts below the frame and takes many seconds to scroll into view) — partial content, content still visibly mid-transition, or empty space that's clearly being animated into is NOT an issue by itself. Only flag ISSUE for things that look permanently wrong: content stuck off-screen with no sign it's moving toward the frame, elements cut off at an edge, or a result that contradicts the instruction (wrong subject, wrong layout entirely).

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
