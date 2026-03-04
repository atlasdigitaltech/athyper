import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    watch: false,
    passWithNoTests: true,
    globals: true,
    environment: "node",
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/build/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["**/node_modules/**", "**/dist/**", "**/generated/**"],
    },
  },
});
