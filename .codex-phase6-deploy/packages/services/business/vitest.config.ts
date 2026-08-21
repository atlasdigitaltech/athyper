import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "../..",
  test: {
    globals: true,
    environment: "node",
    include: ["services/business/__tests__/**/*.test.ts"],
  },
});
