import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss()],
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
