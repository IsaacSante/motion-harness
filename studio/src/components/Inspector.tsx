import { useEffect, useState } from 'react';
import type { Clip } from '../api';

export interface InspectorProps {
  clip: Clip | null;
  scenes: string[];
  onChange: (id: string, patch: Partial<Clip>) => void;
  onDelete: (id: string) => void;
}

export function Inspector({ clip, scenes, onChange, onDelete }: InspectorProps) {
  const [configText, setConfigText] = useState('{}');
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    setConfigText(clip ? JSON.stringify(clip.config, null, 2) : '{}');
    setConfigError(null);
  }, [clip?.id]);

  if (!clip) {
    return (
      <div className="panel inspector-panel">
        <h2>Inspector</h2>
        <div className="empty">Select a clip</div>
      </div>
    );
  }

  const commitConfig = (text: string) => {
    setConfigText(text);
    try {
      const parsed = JSON.parse(text);
      setConfigError(null);
      onChange(clip.id, { config: parsed });
    } catch {
      setConfigError('Invalid JSON — not saved until this is fixed');
    }
  };

  return (
    <div className="panel inspector-panel">
      <h2>Inspector</h2>

      <label>
        Scene
        <select value={clip.scene} onChange={(e) => onChange(clip.id, { scene: e.target.value })}>
          {!scenes.includes(clip.scene) && <option value={clip.scene}>{clip.scene} (missing)</option>}
          {scenes.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>

      <label>
        Duration (s)
        <input
          type="number"
          min={0.1}
          step={0.1}
          value={clip.duration}
          onChange={(e) => onChange(clip.id, { duration: Number(e.target.value) || 0 })}
        />
      </label>

      <label>
        Config (JSON)
        <textarea
          rows={10}
          value={configText}
          onChange={(e) => commitConfig(e.target.value)}
        />
      </label>
      {configError && <div className="error">{configError}</div>}

      <button className="danger" onClick={() => onDelete(clip.id)}>Delete clip</button>
    </div>
  );
}
