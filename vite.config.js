import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // GitHub Pages serves this repository below /skogafoss-waterfall/.
  // Local dev and preview keep the root path for a simple localhost URL.
  base: process.env.GITHUB_ACTIONS ? '/skogafoss-waterfall/' : '/',
  build: {
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        webgl: resolve(import.meta.dirname, 'webgl.html'),
        webgpu: resolve(import.meta.dirname, 'webgpu.html')
      }
    }
  }
});
