import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Explicit imports per package convention — keeps `vitest/globals` out of
    // tsconfig and lets the typechecker stay strict about test-file imports.
    // Shell/stack render tests live in @athyper/ui (where the components do);
    // this package only hosts pure-logic adapter tests, so node env is enough.
    globals: false,
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "dist/**"],
  },
});
