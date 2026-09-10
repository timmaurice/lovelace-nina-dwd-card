import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './test/setup.ts',
    alias: { '\\.scss$': './test/styleMock.ts' },
    // The end-to-end specs are Playwright's, not Vitest's: they import
    // node:child_process and drive a browser, and jsdom cannot run them.
    exclude: ['**/node_modules/**', '**/dist/**', 'test/e2e/**'],
  },
});
