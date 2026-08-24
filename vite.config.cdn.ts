import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/browser.ts'),
      name: 'AfricaniesShipping',
      formats: ['iife'],
      fileName: () => 'africanies-shipping.global.js',
    },
    // The inline Tailwind stylesheet has no trustworthy transform source map.
    sourcemap: false,
    emptyOutDir: false,
  },
});
