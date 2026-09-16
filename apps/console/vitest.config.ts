import { defineConfig } from 'vitest/config';

// No client *component* tests yet: rendering is exercised end-to-end by Playwright instead
// (apps/console/e2e/). `client/test/**/*.test.ts` (never `.tsx`) is for plain-function client
// logic that needs no DOM -- AtlasRoom.tsx's layoutTiles() (issue 177) is the first of these.
// When a real component test arrives, add an `environmentMatchGlobs` entry for jsdom and the
// `jsdom` dev dependency then; the `node` environment below is wrong for one, right for this.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/test/**/*.test.ts', 'client/test/**/*.test.ts'],
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
