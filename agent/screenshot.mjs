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
    // An uncaught exception during enter() (e.g. a config field the code
    // assumed was present but wasn't) aborts the scene before anything
    // renders — from a screenshot alone that's indistinguishable from
    // "correctly renders as blank", so the vision judge has no way to name
    // the actual cause. Collecting these lets the caller short-circuit
    // straight to the real reason instead of asking the model to guess from
    // a blank frame. Only `pageerror` (uncaught JS exceptions), not
    // console.error — the latter is too noisy (favicon 404s, benign
    // warnings) to trust as a signal.
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
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
    return { screenshotBase64: composite, pageErrors };
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
          text: `This is a stacked composite of 3 screenshots of the same generated motion-graphics scene called "${sceneName}", each labeled with its timecode (${FRAME_LABELS.join(', ')} after it started), rendered at ${CANONICAL_WIDTH}x${CANONICAL_HEIGHT}. Together they show how it evolves over its first 10 seconds. It was generated from this instruction:

"${instruction}"

Judge it for two things only, as a low bar for "does this basically work" — NOT a design review:
1. Is there clearly-visible content (actual text/graphics, not just an empty background) somewhere in the frame at some point across the 3 frames?
2. Does the general subject match what the instruction asked for?

Be LENIENT — this is a pass/fail gate that runs BEFORE a separate, dedicated design-quality pass; spacing, alignment, composition, polish, and "does this look professionally designed" are judged there, not here, so don't fail a scene for those. In particular, do NOT flag ISSUE for:
- Stylistic distortion, skew, blur, or foreshortening that's clearly an intentional effect — e.g. a 3D perspective crawl is SUPPOSED to warp and shrink text toward a vanishing point; that's the effect working correctly, not a defect. Only flag if it makes content entirely illegible at every frame with no improvement over time.
- Not precisely matching a specific well-known reference's exact layout, timing, or typography — the brief only needs the general idea (a brief mentioning "Star Wars intro" just needs to be a receding/scrolling title crawl, not a pixel-accurate recreation of the real film's exact framing).
- Minor overlap, tight spacing, or an element running close to an edge — only flag if content is majority off-frame or fully cut off in EVERY frame, not just close to it.

Some scenes have a deliberately slow-building intro (e.g. a scrolling crawl that starts below the frame and takes many seconds to scroll into view), or a deliberate beat of black between sections — that's exactly why you're shown progress over time instead of one instant. If the frames show things moving toward/into the frame (comparing t=1s to t=5s to t=10s), or a later frame has content even if an earlier/middle one doesn't, that's working as intended, not an issue. Only flag ISSUE if, across all 3 frames, something looks permanently and structurally broken: every single frame is entirely blank with no content anywhere, content stuck in the same broken position with no movement toward the frame ever, content majority off-screen in every frame, or the result contradicts the instruction's actual subject entirely (e.g. asked for a title card, got an unrelated chart).

Reply with a first line that is EXACTLY "OK" or "ISSUE" and nothing else on that line. If ISSUE, follow with 1-3 short sentences explaining what's wrong, specific enough that a developer could fix it (e.g. "the title text is rendered ~700px to the right of the visible frame in all 3 frames, mostly off-screen").`,
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
          text: `This is a stacked composite of 3 screenshots of the same generated motion-graphics scene called "${sceneName}", each labeled with its timecode (${FRAME_LABELS.join(', ')} after it started), rendered at ${CANONICAL_WIDTH}x${CANONICAL_HEIGHT}. It was generated from this instruction:

"${instruction}"

It's already confirmed correct — nothing is permanently off-screen and it matches the instruction. Now judge it purely on design quality, mainly using whichever frame(s) show the composition settled (later frames, unless the scene is still transitioning at t=10s too): spacing and breathing room, alignment, visual balance, whether sizes and gaps feel intentional rather than arbitrary. Be a demanding designer, not a lenient one — "technically fine" is not the bar.

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
