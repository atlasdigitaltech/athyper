import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "../..",
  test: {
    globals:     true,
    environment: "node",
    include:     [
      "services/finance/__tests__/**/*.test.ts",
      "services/finance/routes/__tests__/**/*.test.ts",
    ],
  },
});
