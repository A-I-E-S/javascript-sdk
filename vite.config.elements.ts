import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// CSS-bearing browser entries are built separately so headless source maps stay
// accurate. Tailwind currently does not emit a source map for `?inline` CSS.
export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    lib: {
      entry: {
        elements: resolve(import.meta.dirname, 'src/elements.ts'),
        browser: resolve(import.meta.dirname, 'src/browser.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    sourcemap: false,
    emptyOutDir: false,
  },
});
