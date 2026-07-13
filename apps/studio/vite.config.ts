import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

const frontendSrc = fileURLToPath(new URL("../../packages/frontend/src/", import.meta.url));

// noinspection JSUnusedGlobalSymbols
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      {
        find: "react",
        replacement: fileURLToPath(new URL("./node_modules/react", import.meta.url)),
      },
      {
        find: "react-dom",
        replacement: fileURLToPath(new URL("./node_modules/react-dom", import.meta.url)),
      },
      {
        find: /^@transport\/frontend$/,
        replacement: `${frontendSrc}index.ts`,
      },
      {
        find: /^@transport\/frontend\/(.+)$/,
        replacement: `${frontendSrc}$1`,
      },
      {
        find: "@transport/transport-worker",
        replacement: fileURLToPath(new URL("../../packages/transport-worker/src/index.ts", import.meta.url)),
      },
      {
        find: "@transport/native-execution-contract",
        replacement: fileURLToPath(new URL("../../packages/native-execution-contract/src/index.ts", import.meta.url)),
      },
    ],
  },
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
