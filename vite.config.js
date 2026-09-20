import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
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
