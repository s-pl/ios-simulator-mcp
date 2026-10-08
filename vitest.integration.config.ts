import { defineConfig } from 'vitest/config';

/** Tests against a real simulator: macOS with Xcode only. They boot a device, so they are slow. */
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 300_000,
    hookTimeout: 600_000,
    fileParallelism: false,
  },
});
