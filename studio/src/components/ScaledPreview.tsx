import { useEffect, useRef, useState } from 'react';

// Canonical preview resolution — matches the 1920x1080 stage size used
// throughout the reference project's scenes. Scaling the iframe down from a
// fixed intrinsic size (rather than stretching it to fill the pane) is what
// keeps the aspect ratio correct regardless of how wide the panel is.
const CANONICAL_W = 1920;
const CANONICAL_H = 1080;

export interface ScaledPreviewProps {
  url: string;
  /** Bump this to force the preview to reload from t=0. The iframe is a
   * different origin (different port) than the studio itself, so the parent
   * can't reach into it to call location.reload() directly — remounting via
   * a changed key is the only cross-origin-safe way to restart it. Without
   * this, a scene that finishes playing (most are a few seconds, no loop)
   * just sits on its last frame or a blank overlay forever, with nothing in
   * the UI to get it playing again short of a manual browser refresh. */
  reloadToken?: number;
}

export function ScaledPreview({ url, reloadToken = 0 }: ScaledPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setScale(Math.min(width / CANONICAL_W, height / CANONICAL_H));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="scaled-preview-container">
      {scale > 0 && (
        <div
          className="scaled-preview-footprint"
          style={{ width: CANONICAL_W * scale, height: CANONICAL_H * scale }}
        >
          <div
            className="scaled-preview-frame"
            style={{ width: CANONICAL_W, height: CANONICAL_H, transform: `scale(${scale})` }}
          >
            <iframe key={`${url}:${reloadToken}`} src={url} title="preview" width={CANONICAL_W} height={CANONICAL_H} />
          </div>
        </div>
      )}
    </div>
  );
}
