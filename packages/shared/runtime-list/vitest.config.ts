import { defineConfig } from "vitest/config";

export default defineConfig({
  // Force the automatic JSX runtime. Mirrors the line-item-runtime config
  // for the same reason: runtime-list's tsconfig uses `jsx: "preserve"` so
  // vitest needs an explicit transform mode.
  esbuild: {
    jsx: "automatic",
  },
  test: {
    globals: false,
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "dist/**"],
  },
});
