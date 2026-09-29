// Staged lint rollout. Everything is "warn" so the gate can report a baseline
// without blocking work; promote rules to "error" once their backlog is clear.
// Scope starts at the shared Entity Framework surface (contracts + platform UI).
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.next/**",
      "**/.turbo/**",
    ],
  },
  {
    files: [
      "packages/contracts/platform/**/*.{ts,tsx}",
      "packages/platform/**/*.{ts,tsx}",
    ],
    ignores: [
      "**/*.d.ts",
      "**/__tests__/**",
      "**/*.test.{ts,tsx}",
      "**/*.config.ts",
      "**/scripts/**",
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    linterOptions: { reportUnusedDisableDirectives: "warn" },
    rules: {
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
      ...Object.fromEntries(
        Object.keys(jsxA11y.configs.recommended.rules)
          // Deprecated in favour of label-has-associated-control.
          .filter((rule) => rule !== "jsx-a11y/label-has-for")
          .map((rule) => [rule, "warn"]),
      ),
    },
  },
  {
    // Keep explicit `any` visible in the shared Entity Framework while its
    // remaining contracts are narrowed. This is warning-only during rollout.
    files: [
      "packages/contracts/platform/entity-runtime/**/*.{ts,tsx}",
      "packages/platform/entity/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
