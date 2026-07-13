import { useRef } from 'react';
import type { Clip } from '../api';
import { ClipBlock } from './ClipBlock';

export interface TimelineProps {
  clips: Clip[];
  selectedClipId: string | null;
  onSelect: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onAddClip: () => void;
}

export function Timeline({ clips, selectedClipId, onSelect, onReorder, onAddClip }: TimelineProps) {
  const dragIndex = useRef<number | null>(null);
  const overIndex = useRef<number | null>(null);

  return (
    <div className="panel timeline-panel">
      <div className="timeline-header">
        <h2>Timeline</h2>
        <button onClick={onAddClip}>+ Add clip</button>
      </div>
      <div className="timeline-track">
        {clips.map((clip, index) => (
          <ClipBlock
            key={clip.id}
            clip={clip}
            index={index}
            selected={clip.id === selectedClipId}
            onSelect={onSelect}
            onDragStart={(i) => { dragIndex.current = i; }}
            onDragOver={(i) => { overIndex.current = i; }}
            onDrop={() => {
              if (dragIndex.current !== null && overIndex.current !== null && dragIndex.current !== overIndex.current) {
                onReorder(dragIndex.current, overIndex.current);
              }
              dragIndex.current = null;
              overIndex.current = null;
            }}
          />
        ))}
        {clips.length === 0 && <div className="empty">No clips — add one to get started</div>}
      </div>
    </div>
  );
}
