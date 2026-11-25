import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { assetManifest } from './plugins/assetManifest.ts';

// `base: './'` keeps every URL relative, so the built site works from any
// folder, including a GitHub Pages project site at /<repo>/.
export default defineConfig({
  base: './',
  plugins: [react(), assetManifest()],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  worker: {
    format: 'es',
  },
});
