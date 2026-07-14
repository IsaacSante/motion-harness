// Not a real scene — never registered in main.ts's sceneRegistry, never on
// the timeline. This exists purely so agent/context.mjs has a correctly-
// shaped, project-idiomatic example to show the model on a brand-new
// project's very first generation (import paths, tokens usage, the
// createLayeredElement absolute-positioning precondition, teardown). Once a
// project has a real generated scene, buildContext() prefers that instead —
// see agent/context.mjs.
import gsap from 'gsap';
import type { Scene } from 'motion-harness';
import { defineBeats, createLayeredElement, riseFade, createTeardownBag } from 'motion-harness';
import { color, type as typeTokens } from './tokens';

const beats = defineBeats({
  entryDuration: 0.6,
  hold: 1.5,
  exitDuration: 0.4,
});

export interface ReferenceConfig {
  label?: string;
}

export const referenceScene = (config: ReferenceConfig = {}): Scene<ReferenceConfig> => {
  let root: HTMLDivElement;
  const bag = createTeardownBag();

  return {
    id: 'reference',
    config,

    async enter({ overlay, width, height, transparentBg }) {
      overlay.style.background = transparentBg ? 'transparent' : color.bg;

      root = document.createElement('div');
      Object.assign(root.style, { position: 'relative', width: '100%', height: '100%' });
      overlay.appendChild(root);

      const el = document.createElement('div');
      el.textContent = config.label ?? 'Reference scene';
      Object.assign(el.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        color: color.fg,
        fontFamily: typeTokens.sans,
        fontSize: '2rem',
        fontWeight: String(typeTokens.weight.semibold),
      });
      // Appended with its final content/style set BEFORE createLayeredElement
      // runs — createLayeredElement.center measures el's actual rendered
      // size, so el must already be in the DOM and fully styled first.
      root.appendChild(el);

      const layered = createLayeredElement(el, ['entry'] as const, {
        // Measures el's own rendered size and centers it on this point —
        // the correct way to center an element via transform, no manual
        // origin math, no risk of double-centering by also giving el
        // self-centering CSS (width: '100%' + textAlign: 'center') on top.
        center: { x: width / 2, y: height / 2 },
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
