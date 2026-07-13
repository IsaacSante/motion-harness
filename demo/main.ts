import { SceneManager, startLoop } from '../src';
import type { SceneCtx } from '../src';
import { cardsDemoScene } from './scenes/cards-demo';

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

manager.play([cardsDemoScene()]);
