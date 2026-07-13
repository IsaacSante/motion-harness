import { useState } from 'react';
import type { Project } from '../api';

export interface ProjectListProps {
  projects: Project[];
  selected: string | null;
  onSelect: (name: string) => void;
  onCreate: (name: string, targetDir: string) => Promise<void>;
}

export function ProjectList({ projects, selected, onSelect, onCreate }: ProjectListProps) {
  const [name, setName] = useState('');
  const [targetDir, setTargetDir] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !targetDir.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await onCreate(name.trim(), targetDir.trim());
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="panel project-list">
      <h2>Projects</h2>
      <ul>
        {projects.map((p) => (
          <li key={p.name}>
            <button
              className={p.name === selected ? 'project-item selected' : 'project-item'}
              onClick={() => onSelect(p.name)}
            >
              <span className="project-name">{p.name}</span>
              <span className="project-path">{p.path}</span>
            </button>
          </li>
        ))}
        {projects.length === 0 && <li className="empty">No projects yet</li>}
      </ul>

      <form className="new-project-form" onSubmit={handleCreate}>
        <h3>New project</h3>
        <input
          placeholder="project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={creating}
        />
        <input
          placeholder="/absolute/path/to/parent-dir"
          value={targetDir}
          onChange={(e) => setTargetDir(e.target.value)}
          disabled={creating}
        />
        <button type="submit" disabled={creating}>
          {creating ? 'Creating…' : 'Create'}
        </button>
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
}
