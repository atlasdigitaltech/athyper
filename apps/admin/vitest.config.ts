import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": resolve(root, "."),
      "server-only": resolve(root, "test/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: [
      "app/**/*.test.{ts,tsx}",
      "lib/**/*.test.{ts,tsx}",
    ],
    exclude: ["node_modules/**", ".next/**"],
  },
});
