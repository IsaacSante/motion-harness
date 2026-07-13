import gsap from 'gsap';
import type { Scene } from 'motion-harness';
import { defineBeats, createLayeredElement, riseFade, createTeardownBag } from 'motion-harness';
import { color, type as typeTokens } from '../tokens';

const beats = defineBeats({
  entryDuration: 0.6,
  hold: 1.5,
  exitDuration: 0.4,
});

export interface ExampleConfig {
  label?: string;
}

export const exampleScene = (config: ExampleConfig = {}): Scene<ExampleConfig> => {
  let root: HTMLDivElement;
  const bag = createTeardownBag();

  return {
    id: 'example',
    config,

    async enter({ overlay, width, height }) {
      overlay.style.background = color.bg;
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';

      root = document.createElement('div');
      Object.assign(root.style, { position: 'relative', width: '100%', height: '100%' });
      overlay.appendChild(root);

      const el = document.createElement('div');
      el.textContent = config.label ?? 'New scene';
      Object.assign(el.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        color: color.fg,
        fontFamily: typeTokens.sans,
        fontSize: '2rem',
        fontWeight: String(typeTokens.weight.semibold),
      });
      root.appendChild(el);

      const layered = createLayeredElement(el, ['entry'] as const, {
        origin: { x: width / 2, y: height / 2 },
      });
      const spec = riseFade();
      Object.assign(layered.layers.entry, spec.from);
      layered.apply();

      await bag.track(
        gsap.to(layered.layers.entry, {
          ...spec.to,
          duration: spec.duration,
          ease: spec.ease,
          onUpdate: layered.apply,
        }),
      );
      await gsap.to({}, { duration: beats('hold') });
    },

    async exit() {
      bag.killAll();
      await gsap.to(root, { opacity: 0, duration: beats('exitDuration') });
      root.remove();
    },
  };
};
