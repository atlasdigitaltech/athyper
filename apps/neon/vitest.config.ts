import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Vitest config for BFF route handler tests.
// JSX transform is auto (we don't render React here — just exercise route exports).
// The `@` alias mirrors tsconfig.json so test files can import server helpers
// via `@/lib/server/...` the way the route files do.
export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
      "server-only": resolve(__dirname, "test/server-only.ts"),
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: [
      "app/**/__tests__/**/*.test.{ts,tsx}",
      "lib/**/__tests__/**/*.test.{ts,tsx}",
    ],
    exclude: ["node_modules/**", ".next/**"],
  },
});
