import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        server: resolve(import.meta.dirname, 'src/server.ts'),
        ui: resolve(import.meta.dirname, 'src/ui.ts'),
        elements: resolve(import.meta.dirname, 'src/elements.ts'),
        browser: resolve(import.meta.dirname, 'src/browser.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    sourcemap: true,
    emptyOutDir: false,
  },
});
