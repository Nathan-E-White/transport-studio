import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// noinspection JSUnusedGlobalSymbols
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 }
});
