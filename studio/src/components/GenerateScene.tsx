import { useEffect, useState } from 'react';
import { api } from '../api';

export interface GenerateSceneProps {
  project: string;
  /** The currently selected clip's scene name, if any — prefills the form for a "regenerate this clip" flow. */
  selectedClipScene: string | null;
  onGenerated: () => void;
}

export function GenerateScene({ project, selectedClipScene, onGenerated }: GenerateSceneProps) {
  const [sceneName, setSceneName] = useState('');
  const [instruction, setInstruction] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (selectedClipScene) {
      setSceneName(selectedClipScene);
      setOverwrite(true);
    }
  }, [selectedClipScene]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sceneName.trim() || !instruction.trim()) return;
    setStatus('loading');
    setMessage('');
    try {
      const result = await api.generateScene(project, sceneName.trim(), instruction.trim(), overwrite);
      if (result.success) {
        setStatus('success');
        setMessage(
          result.warning
            ? `Generated after ${result.attempts} attempt(s). ${result.warning}`
            : `Generated and typechecked cleanly after ${result.attempts} attempt(s).`,
        );
        setInstruction('');
        onGenerated();
      } else {
        setStatus('error');
        setMessage(`Failed after ${result.attempts} attempt(s):\n${result.errors ?? ''}`);
      }
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="panel generate-panel">
      <h2>Generate scene</h2>
      <form onSubmit={submit}>
        <label>
          Scene name
          <input
            placeholder="kebab-case, e.g. intro"
            value={sceneName}
            onChange={(e) => setSceneName(e.target.value)}
            disabled={status === 'loading'}
          />
        </label>
        <label>
          Instruction
          <textarea
            rows={5}
            placeholder="describe the motion — what enters, how, what it does while it holds, how it leaves"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={status === 'loading'}
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
            disabled={status === 'loading'}
          />
          Overwrite if this scene already exists
        </label>
        <button type="submit" disabled={status === 'loading' || !sceneName.trim() || !instruction.trim()}>
          {status === 'loading' ? 'Generating… (this can take a while)' : 'Generate'}
        </button>
      </form>
      {status === 'success' && <div className="status-ok">{message}</div>}
      {status === 'error' && <pre className="error">{message}</pre>}
      {status !== 'loading' && (
        <div className="hint">
          New scenes don't attach to a clip automatically — pick them from this clip's
          Scene dropdown above once generated.
        </div>
      )}
    </div>
  );
}
