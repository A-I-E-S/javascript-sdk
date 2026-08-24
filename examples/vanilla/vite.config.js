import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// The UAT site exercises the candidate SDK source from this repository. Published
// consumers continue to use the package's normal browser export.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/javascript-sdk/' : '/',
  resolve: {
    alias: {
      '@africanies/shipping/browser': fileURLToPath(new URL('../../src/browser.ts', import.meta.url)),
    },
  },
});
