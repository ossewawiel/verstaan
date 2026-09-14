import { defineConfig } from 'vitest/config';

// No client component tests yet: the client is exercised end-to-end by Playwright instead
// (apps/console/e2e/). When client unit tests arrive, add 'client/test/**/*.test.tsx' back to
// `include` together with an `environmentMatchGlobs` entry for jsdom and the `jsdom` dev
// dependency, rather than pointing at a directory that does not exist.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/test/**/*.test.ts'],
    // Windows CI (issue 162) hit a reproducible "SyntaxError: Invalid or unexpected token" in
    // exactly one test file, at the same reported location regardless of what character actually
    // sat there -- the signature of a worker-thread transform-cache bug in Vitest's default
    // `threads` pool on Windows, not a real syntax error (this file parses cleanly with plain
    // `tsc`, and passes locally and on both Linux CI legs every time). `forks` runs each file in
    // its own process instead of a shared worker thread, which is the standard workaround for
    // this class of Windows-only Vitest flake.
    pool: 'forks',
  },
});
