import { defineConfig } from 'vitest/config';

// Pure-TS unit tests for math (vec2), grids (HashGrid), and boid behaviour.
// These are framework-agnostic logic tests with no DOM dependencies, so the
// `node` environment is sufficient and faster than jsdom. If a future test
// needs `document`/`canvas`, add `// @vitest-environment jsdom` to that file
// or install jsdom and set `environment: 'jsdom'` here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globals: false,
  },
});
