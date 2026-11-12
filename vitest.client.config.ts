import { defineConfig } from 'vitest/config';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  // No HMR in tests: solid-refresh wraps components and renames them to
  // `[solid-refresh]<Name>`, so tests would see different functions than the app.
  plugins: [solidPlugin({ ssr: false, hot: false })],
  test: {
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    // The first import of a heavy component tree (transform included) can pass the
    // default 10 s hook limit on Windows while the whole suite runs in parallel;
    // vitest.config.ts has the same allowance for the node suite.
    testTimeout: process.platform === 'win32' ? 120_000 : 5_000,
    hookTimeout: process.platform === 'win32' ? 120_000 : 10_000,
    include: ['src/**/*.client.test.tsx'],
  },
});
