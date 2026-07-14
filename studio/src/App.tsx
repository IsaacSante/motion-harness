import { useEffect, useState } from 'react';
import { api, type Clip, type Project, type Timeline as TimelineData } from './api';
import { ProjectList } from './components/ProjectList';
import { Timeline } from './components/Timeline';
import { Inspector } from './components/Inspector';
import { GenerateScene } from './components/GenerateScene';
import { ScaledPreview } from './components/ScaledPreview';

const newClipId = () => `clip-${Math.random().toString(36).slice(2, 9)}`;

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [scenes, setScenes] = useState<string[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  // Most scenes are a few seconds with no loop — once playback finishes the
  // preview just sits there (blank, or on its last frame) with nothing to
  // watch. Bumping this remounts the preview iframe from t=0; see
  // ScaledPreview for why a plain iframe.contentWindow.reload() can't work
  // (different origin/port than the studio itself).
  const [previewReloadToken, setPreviewReloadToken] = useState(0);

  useEffect(() => {
    api.listProjects().then(setProjects).catch((err) => setStatus(String(err)));
  }, []);

  const selectProject = async (name: string) => {
    if (selectedProject && selectedProject !== name) {
      api.stopPreview(selectedProject).catch(() => {});
    }
    setSelectedProject(name);
    setSelectedClipId(null);
    setPreviewUrl(null);
    const [tl, sceneNames] = await Promise.all([api.getTimeline(name), api.listScenes(name)]);
    setTimeline(tl);
    setScenes(sceneNames);
    setDirty(false);

    setPreviewLoading(true);
    try {
      const { url } = await api.startPreview(name);
      setPreviewUrl(url);
    } finally {
      setPreviewLoading(false);
    }
  };

  const createProject = async (name: string, targetDir?: string) => {
    const updated = await api.createProject(name, targetDir);
    setProjects(updated);
    await selectProject(name);
  };

  const mutateClips = (mutate: (clips: Clip[]) => Clip[]) => {
    setTimeline((prev) => (prev ? { ...prev, clips: mutate(prev.clips) } : prev));
    setDirty(true);
  };

  const reorder = (fromIndex: number, toIndex: number) => {
    mutateClips((clips) => {
      const next = [...clips];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const addClip = () => {
    mutateClips((clips) => [
      ...clips,
      { id: newClipId(), scene: scenes[0] ?? 'example', duration: 3, config: {} },
    ]);
  };

  const updateClip = (id: string, patch: Partial<Clip>) => {
    mutateClips((clips) => clips.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const deleteClip = (id: string) => {
    mutateClips((clips) => clips.filter((c) => c.id !== id));
    if (selectedClipId === id) setSelectedClipId(null);
  };

  const save = async () => {
    if (!selectedProject || !timeline) return;
    await api.saveTimeline(selectedProject, timeline);
    setDirty(false);
    setStatus('Saved');
    setPreviewReloadToken((t) => t + 1);
    setTimeout(() => setStatus(null), 1500);
  };

  const openFullscreen = () => {
    // Not the raw project URL — that would let the new tab's arbitrary size
    // drive the project's own layout, producing a different result than the
    // embedded preview rather than a zoomed-in view of the same thing. This
    // route re-renders the same fixed-resolution ScaledPreview, just filling
    // the whole tab instead of a small panel.
    if (previewUrl) window.open(`/?previewUrl=${encodeURIComponent(previewUrl)}`, '_blank');
  };

  const selectedClip = timeline?.clips.find((c) => c.id === selectedClipId) ?? null;

  return (
    <div className="app">
      <ProjectList
        projects={projects}
        selected={selectedProject}
        onSelect={selectProject}
        onCreate={createProject}
      />

      <div className="main">
        {selectedProject && timeline ? (
          <>
            <div className="toolbar">
              <h1>{selectedProject}</h1>
              <div className="toolbar-actions">
                {status && <span className="status">{status}</span>}
                <button onClick={save} disabled={!dirty}>Save{dirty ? '*' : ''}</button>
                <button
                  onClick={() => setPreviewReloadToken((t) => t + 1)}
                  disabled={!previewUrl}
                  title="Most scenes finish playing in a few seconds and don't loop — use this to watch again"
                >
                  ↺ Restart preview
                </button>
                <button onClick={openFullscreen} disabled={!previewUrl}>
                  {previewLoading && !previewUrl ? 'Starting…' : 'Open fullscreen'}
                </button>
              </div>
            </div>

            <Timeline
              clips={timeline.clips}
              selectedClipId={selectedClipId}
              onSelect={setSelectedClipId}
              onReorder={reorder}
              onAddClip={addClip}
            />

            <div className="workspace">
              <div className="preview-pane">
                {previewUrl ? (
                  <ScaledPreview url={previewUrl} reloadToken={previewReloadToken} />
                ) : (
                  <div className="empty">{previewLoading ? 'Starting preview…' : 'Preview unavailable'}</div>
                )}
              </div>
              <div className="side-panels">
                <Inspector clip={selectedClip} scenes={scenes} onChange={updateClip} onDelete={deleteClip} />
                <GenerateScene
                  project={selectedProject}
                  selectedClipScene={selectedClip?.scene ?? null}
                  onGenerated={(sceneName) => {
                    api.listScenes(selectedProject).then(setScenes);
                    const alreadyOnTimeline = timeline.clips.some((c) => c.scene === sceneName);
                    if (alreadyOnTimeline) return;
                    // Auto-attach must also auto-save: the live preview reads
                    // timeline.json off disk, not React state. Leaving this
                    // as a dirty in-memory edit meant "generate a scene" and
                    // "actually see it" were two steps with nothing telling
                    // you the first one silently did nothing on its own —
                    // the preview just kept showing whatever was on disk
                    // before.
                    const next = { ...timeline, clips: [...timeline.clips, { id: newClipId(), scene: sceneName, duration: 3, config: {} }] };
                    setTimeline(next);
                    api.saveTimeline(selectedProject, next).then(() => {
                      setDirty(false);
                      setStatus('Saved — new clip attached');
                      setPreviewReloadToken((t) => t + 1);
                      setTimeout(() => setStatus(null), 1500);
                    });
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">Select or create a project to begin</div>
        )}
      </div>
    </div>
  );
}
