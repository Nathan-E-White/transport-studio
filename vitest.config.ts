import {fileURLToPath} from "node:url";
import {defineConfig} from "vitest/config";

const workspacePackages = [
  "domain",
  "editor-state",
  "frontend",
  "geometry",
  "materials",
  "native-execution-contract",
  "particles",
  "project-io",
  "shared",
  "sources",
  "tallies",
  "transport-visual",
  "transport-worker",
  "validation",
  "viewport",
] as const;

const aliases = workspacePackages.flatMap((packageName) => {
  const sourceRoot = fileURLToPath(new URL(`./packages/${packageName}/src/`, import.meta.url));

  return [
    {
      find: new RegExp(`^@transport/${packageName}$`),
      replacement: `${sourceRoot}index.ts`,
    },
    {
      find: new RegExp(`^@transport/${packageName}/(.+)$`),
      replacement: `${sourceRoot}$1`,
    },
  ];
});

export default defineConfig({
  resolve: {
    alias: aliases,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./apps/studio/src/test/setup.ts"],
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage/vitest",
      include: [
        "apps/studio/src/**/*.{ts,tsx}",
        "packages/*/src/**/*.ts",
      ],
      exclude: [
        "apps/studio/e2e/**",
        "apps/studio/src-tauri/**",
        "**/*.d.ts",
        "**/*.{test,spec}.{ts,tsx}",
        "**/node_modules/**",
        "**/dist/**",
        "**/devs/**",
      ],
    },
    include: [
      "apps/**/*.{test,spec}.{ts,tsx}",
      "packages/**/*.{test,spec}.{ts,tsx}",
      "scripts/**/*.{test,spec}.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.git/**",
      "**/devs/**",
      "apps/studio/e2e/**",
    ],
  },
});
