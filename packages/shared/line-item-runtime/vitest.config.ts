import { defineConfig } from "vitest/config";

export default defineConfig({
  // Force the automatic JSX runtime for every transformed .tsx file. The
  // cross-package import of `@athyper/runtime-list/islands/.../ColumnPickerBase.tsx`
  // matters here: runtime-list's own tsconfig uses `jsx: "preserve"` (for
  // Next.js), so vitest would otherwise emit React.createElement calls
  // without a `React` global in scope.
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
