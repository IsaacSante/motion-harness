import type { Clip } from '../api';

export const PX_PER_SEC = 40;
export const MIN_CLIP_WIDTH = 80;

export interface ClipBlockProps {
  clip: Clip;
  index: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: () => void;
}

export function ClipBlock({ clip, index, selected, onSelect, onDragStart, onDragOver, onDrop }: ClipBlockProps) {
  const width = Math.max(MIN_CLIP_WIDTH, clip.duration * PX_PER_SEC);

  return (
    <div
      className={selected ? 'clip-block selected' : 'clip-block'}
      style={{ width }}
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onClick={() => onSelect(clip.id)}
    >
      <div className="clip-scene">{clip.scene}</div>
      <div className="clip-duration">{clip.duration}s</div>
    </div>
  );
}
