import { defineConfig } from 'vitest/config';

/** Unit and in-memory end-to-end tests: run anywhere, no Mac required. */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
});
