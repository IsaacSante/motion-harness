import { SceneManager, startLoop } from 'motion-harness';
import type { Scene, SceneCtx, SceneFactory } from 'motion-harness';
import timelineData from './timeline.json';

// Add an entry here for every scene file in src/scenes/. The studio's clip
// picker reads scene names straight off src/scenes/, but wiring a scene into
// playback is a deliberate code change, not something the timeline UI does
// for you — keeps "what scenes exist" and "what code runs" honest.
const sceneRegistry: Record<string, SceneFactory<any>> = {

};

interface Clip {
  id: string;
  scene: string;
  duration: number;
  config: Record<string, unknown>;
}

const params = new URLSearchParams(location.search);
const exportMode = params.get('export') === '1';
const transparentBg = exportMode && params.get('solid') !== '1';
// Solo-scene preview: render exactly one scene instead of the timeline.
// Used by the agent's visual-check step to screenshot a scene before it's
// attached to any clip; also useful for manually debugging one scene.
const soloScene = params.get('scene');

if (transparentBg) {
  document.documentElement.classList.add('export');
}

const overlay = document.querySelector<HTMLElement>('#overlay')!;

const base = {
  overlay,
  now: () => performance.now(),
  exportMode,
  transparentBg,
  get width() { return window.innerWidth; },
  get height() { return window.innerHeight; },
  get dpr() { return Math.min(window.devicePixelRatio || 1, 2); },
};

const manager = new SceneManager(base);
startLoop(manager, base as SceneCtx);

const buildScenes = (): Scene[] => {
  if (soloScene) {
    const factory = sceneRegistry[soloScene];
    if (!factory) {
      throw new Error(`no scene registered for "${soloScene}" — add it to sceneRegistry in main.ts`);
    }
    return [factory({})];
  }
  const clips = (timelineData as { clips: Clip[] }).clips;
  return clips.map((clip) => {
    const factory = sceneRegistry[clip.scene];
    if (!factory) {
      throw new Error(`no scene registered for "${clip.scene}" — add it to sceneRegistry in main.ts`);
    }
    return factory(clip.config);
  });
};

if (exportMode) {
  // Defer scene start so the exporter can begin from virtual t=0 with a
  // paused clock — otherwise animations would run during the boot-phase
  // virtual-time advance and finish before frame 0.
  let started = false;
  (window as unknown as { __motion: unknown }).__motion = {
    manager,
    // Fire-and-forget: returning the play promise would deadlock the
    // exporter, since page.evaluate awaits it but the promise can't resolve
    // while virtual time is paused.
    start: () => {
      if (started) return;
      started = true;
      void manager.play(buildScenes());
    },
  };
} else {
  manager.play(buildScenes());
}
