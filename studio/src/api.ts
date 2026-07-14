export interface Project {
  name: string;
  path: string;
}

export interface Clip {
  id: string;
  scene: string;
  duration: number;
  config: Record<string, unknown>;
}

export interface Timeline {
  clips: Clip[];
}

export interface GenerateResult {
  success: boolean;
  sceneName: string;
  factoryName: string;
  attempts: number;
  errors?: string;
  warning?: string;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? res.statusText);
  }
  return res.json();
}

export const api = {
  getConfig: (): Promise<{ defaultProjectsRoot: string }> => fetch('/api/config').then((r) => json(r)),

  listProjects: (): Promise<Project[]> => fetch('/api/projects').then((r) => json(r)),

  createProject: (name: string, targetDir?: string): Promise<Project[]> =>
    fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, targetDir }),
    }).then((r) => json(r)),

  getTimeline: (project: string): Promise<Timeline> =>
    fetch(`/api/projects/${encodeURIComponent(project)}/timeline`).then((r) => json(r)),

  saveTimeline: (project: string, timeline: Timeline): Promise<{ ok: true }> =>
    fetch(`/api/projects/${encodeURIComponent(project)}/timeline`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(timeline),
    }).then((r) => json(r)),

  listScenes: (project: string): Promise<string[]> =>
    fetch(`/api/projects/${encodeURIComponent(project)}/scenes`).then((r) => json(r)),

  generateScene: (project: string, sceneName: string, instruction: string, overwrite = false): Promise<GenerateResult> =>
    fetch(`/api/projects/${encodeURIComponent(project)}/scenes/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneName, instruction, overwrite }),
    }).then((r) => json(r)),

  startPreview: (project: string): Promise<{ url: string }> =>
    fetch(`/api/projects/${encodeURIComponent(project)}/preview/start`, { method: 'POST' }).then((r) => json(r)),

  stopPreview: (project: string): Promise<{ ok: true }> =>
    fetch(`/api/projects/${encodeURIComponent(project)}/preview/stop`, { method: 'POST' }).then((r) => json(r)),
};
