import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "apps/**/__tests__/**/*.test.ts",
      "packages/**/__tests__/**/*.test.ts",
    ],
  },
});
