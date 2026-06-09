import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "src/**/__tests__/**/*.test.ts",
      "packages/runtime/**/__tests__/**/*.test.ts",
      "packages/adapters/db/src/**/__tests__/**/*.test.ts",
    ],
  },
});
