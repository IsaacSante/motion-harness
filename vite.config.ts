import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  server: { open: true },
  build: { target: 'es2022', outDir: '../dist' },
  esbuild: { target: 'es2022' },
});
