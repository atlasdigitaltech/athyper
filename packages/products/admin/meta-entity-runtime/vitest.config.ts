import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@athyper/meta-entity-authoring-contracts": fileURLToPath(
        new URL("../../../shared/data-integration/meta-entity-authoring-contracts/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
