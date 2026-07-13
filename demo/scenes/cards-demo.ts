import gsap from 'gsap';
import type { Scene } from '../../src';
import { defineBeats, createLayeredElement, riseFade, rowSlots, createTeardownBag } from '../../src';

// Proves the kit pieces compose: beats drive pacing, riseFade supplies the
// motion spec, createLayeredElement is the single writer, rowSlots lays the
// row out, and the teardown bag replaces the hand-rolled exit boilerplate.
// Deliberately plain styling — this is the harness, not a brand.

const beats = defineBeats({
  cardStagger: 0.08,
  entryDuration: 0.6,
  hold: 1.2,
  exitDuration: 0.4,
});

const LABELS = ['Discover', 'Design', 'Ship'];
const CARD_W = 220;
const CARD_H = 140;

export const cardsDemoScene = (): Scene<void> => {
  let root: HTMLDivElement;
  const bag = createTeardownBag();

  return {
    id: 'cards-demo',
    config: undefined,

    async enter({ overlay, width, height }) {
      overlay.style.background = '#111318';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';

      root = document.createElement('div');
      Object.assign(root.style, { position: 'relative', width: '100%', height: '100%' });
      overlay.appendChild(root);

      const slots = rowSlots(LABELS.length, width / 2, height / 2, CARD_W, 32);

      const enters = LABELS.map((label, i) => {
        const el = document.createElement('div');
        el.textContent = label;
        Object.assign(el.style, {
          position: 'absolute',
          left: '0',
          top: '0',
          width: `${CARD_W}px`,
          height: `${CARD_H}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#2a2f3a',
          color: '#f4f4f5',
          fontFamily: 'system-ui, sans-serif',
          fontSize: '1.25rem',
          fontWeight: '600',
          borderRadius: '12px',
        });
        root.appendChild(el);

        const layered = createLayeredElement(el, ['entry'] as const, {
          origin: { x: slots[i].x - CARD_W / 2, y: slots[i].y - CARD_H / 2 },
        });

        const spec = riseFade();
        Object.assign(layered.layers.entry, spec.from);
        layered.apply();

        return bag.track(
          gsap.to(layered.layers.entry, {
            ...spec.to,
            duration: spec.duration,
            ease: spec.ease,
            delay: i * beats('cardStagger'),
            onUpdate: layered.apply,
          }),
        );
      });

      await Promise.all(enters);
      await gsap.to({}, { duration: beats('hold') });
    },

    async exit() {
      bag.killAll();
      await gsap.to(root, { opacity: 0, duration: beats('exitDuration') });
      root.remove();
    },
  };
};
