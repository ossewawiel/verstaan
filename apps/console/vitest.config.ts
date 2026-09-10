import { defineConfig } from 'vitest/config';

// No client component tests yet: the client is exercised end-to-end by Playwright instead
// (apps/console/e2e/). When client unit tests arrive, add 'client/test/**/*.test.tsx' back to
// `include` together with an `environmentMatchGlobs` entry for jsdom and the `jsdom` dev
// dependency, rather than pointing at a directory that does not exist.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/test/**/*.test.ts'],
  },
});
