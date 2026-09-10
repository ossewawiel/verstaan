import { defineConfig } from '@playwright/test';
import { FIXTURE_REPO, buildFixtureRepo, buildHeadWorktree } from './e2e/fixture-repo';

// apps/console: Playwright drives the built app against the real Fastify server (npm run build
// && npm run start), on a port the ordinary console never binds, so a running dev instance on
// 7864 never collides with the test run. The server points at a disposable fixture repo
// (VERSTAAN_CONSOLE_TEST_REPO), built here before the server starts, so no test ever writes into
// this checkout's own docs/factory/issues.
const PORT = 7865;
buildFixtureRepo();
// A real git repo and a second worktree at its own HEAD (issue 112's now-row.spec.ts), built
// before the server starts so its startup worktree scan already knows about the tree.
buildHeadWorktree();

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  webServer: {
    command: `node dist-server/server/src/index.js --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: { VERSTAAN_CONSOLE_PORT: String(PORT), VERSTAAN_CONSOLE_TEST_REPO: FIXTURE_REPO },
  },
});
