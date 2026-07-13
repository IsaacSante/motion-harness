import { SceneManager, startLoop } from 'motion-harness';
import type { SceneCtx, SceneFactory } from 'motion-harness';
import timelineData from './timeline.json';
import { exampleScene } from './scenes/example';

// Add an entry here for every scene file in src/scenes/. The studio's clip
// picker reads scene names straight off src/scenes/, but wiring a scene into
// playback is a deliberate code change, not something the timeline UI does
// for you — keeps "what scenes exist" and "what code runs" honest.
const sceneRegistry: Record<string, SceneFactory<any>> = {
  example: exampleScene,
};

interface Clip {
  id: string;
  scene: string;
  duration: number;
  config: Record<string, unknown>;
}

const overlay = document.querySelector<HTMLElement>('#overlay')!;

const base = {
  overlay,
  now: () => performance.now(),
  exportMode: false,
  transparentBg: false,
  get width() { return window.innerWidth; },
  get height() { return window.innerHeight; },
  get dpr() { return Math.min(window.devicePixelRatio || 1, 2); },
};

const manager = new SceneManager(base);
startLoop(manager, base as SceneCtx);

const clips = (timelineData as { clips: Clip[] }).clips;
const scenes = clips.map((clip) => {
  const factory = sceneRegistry[clip.scene];
  if (!factory) {
    throw new Error(`no scene registered for "${clip.scene}" — add it to sceneRegistry in main.ts`);
  }
  return factory(clip.config);
});

manager.play(scenes);
