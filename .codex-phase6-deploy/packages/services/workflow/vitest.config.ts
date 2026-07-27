import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "../..",
  test: {
    globals: true,
    environment: "node",
    include: ["services/workflow/__tests__/**/*.test.ts"],
  },
});
