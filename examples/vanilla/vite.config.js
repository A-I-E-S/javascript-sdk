import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// The UAT site exercises the candidate SDK source from this repository. Published
// consumers continue to use the package's normal browser export.
export default defineConfig({
  plugins: [tailwindcss()],
  // Local builds and unique-domain Pages sites are rooted at `/`. Project
  // Pages deployments supply their actual base path through Vite's --base CLI
  // option using metadata returned by actions/configure-pages.
  base: '/',
  resolve: {
    alias: {
      '@africanies/shipping/browser': fileURLToPath(new URL('../../src/browser.ts', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        automatic: fileURLToPath(new URL('./index.html', import.meta.url)),
        manual: fileURLToPath(new URL('./manual.html', import.meta.url)),
      },
    },
  },
});
