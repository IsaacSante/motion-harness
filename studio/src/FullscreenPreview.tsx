import { ScaledPreview } from './components/ScaledPreview';

export interface FullscreenPreviewProps {
  url: string;
}

// Same scaling technique as the studio's embedded preview panel, just
// filling the whole viewport instead of a small box next to the timeline.
// Deliberately NOT "open the raw project URL and hope the window is the
// right size" — that made the tab compute its own layout for whatever
// arbitrary size it happened to be, which is a different result than the
// embedded preview, not a zoomed-in view of the same thing.
export function FullscreenPreview({ url }: FullscreenPreviewProps) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <ScaledPreview url={url} />
    </div>
  );
}
