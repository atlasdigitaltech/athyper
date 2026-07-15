import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Explicit imports per package convention — keeps `vitest/globals` out of
    // tsconfig and lets the typechecker stay strict about test-file imports.
    globals: false,
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/__tests__/**",
        "src/index.ts",
        "src/**/index.ts",
      ],
      // Thresholds calibrated against actual baseline (June 2026) minus a
      // ~3% regression margin. Branches lag the others because most
      // un-covered code is in top-level components (DragDropUploadZone,
      // DocumentObjectPage) that are integration-tested via consumers
      // rather than unit-tested here. Tighten when those land unit tests.
      thresholds: {
        statements: 75,
        branches: 55,
        functions: 70,
        lines: 80,
      },
    },
  },
});
