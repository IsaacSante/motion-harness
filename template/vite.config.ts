import { defineConfig } from 'vite';

export default defineConfig({
  // Deliberately no server.open — the studio spawns this dev server in the
  // background the instant a project is selected (before you've clicked
  // anything), and again for every export/visual-check run. Auto-opening a
  // tab on every one of those background spawns pops a real browser window
  // outside the studio's own embedded/fullscreen preview. If you're running
  // this project standalone (`npm run dev`, no studio), open the printed
  // URL yourself.
  build: { target: 'es2022' },
  esbuild: { target: 'es2022' },
});
