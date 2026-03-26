import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      // Barrel re-export files contain only `export *` module syntax which V8
      // cannot mark as executed statements; exclude them from coverage metrics.
      exclude: ['src/rules/index.js'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
      reporter: ['text', 'lcov', 'html'],
    },
  },
});
