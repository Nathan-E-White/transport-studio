// @ts-check

/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
const config = {
  plugins: [
    "@stryker-mutator/vitest-runner",
    "@stryker-mutator/typescript-checker",
  ],
  testRunner: "vitest",
  checkers: ["typescript"],
  concurrency: 2,
  tsconfigFile: "tsconfig.stryker.json",
  reporters: ["progress", "clear-text", "html"],
  ignorePatterns: [
    "apps/studio/src-tauri/target/**",
    "**/target/**",
    "devs/**",
  ],
  incremental: true,
  incrementalFile: "reports/stryker-incremental.json",
  mutate: [
    "packages/domain/src/**/*.ts",
    "packages/validation/src/**/*.ts",
    "packages/transport-visual/src/**/*.ts",
    "apps/studio/src/app/projectMutations.ts",
    "apps/studio/src/state/editor/editorStore.ts",
    "apps/studio/src/state/editor/entities.ts",
    "apps/studio/src/state/editor/modes.ts",
    "apps/studio/src/state/editor/projectTree.ts",
    "apps/studio/src/state/editor/selection.ts",
    "apps/studio/src/state/editor/stale.ts",
    "apps/studio/src/state/editor/visibility.ts",
    "!**/*.d.ts",
    "!**/*.{test,spec}.{ts,tsx}",
    "!apps/studio/e2e/**",
    "!apps/studio/src/**/*.tsx",
    "!apps/studio/src-tauri/**",
    "!devs/**",
    "!**/dist/**",
    "!**/node_modules/**",
  ],
  thresholds: {
    break: 0,
    low: 60,
    high: 80,
  },
  vitest: {
    configFile: "vitest.config.ts",
    related: true,
  },
  typescriptChecker: {
    prioritizePerformanceOverAccuracy: true,
  },
};

export default config;
