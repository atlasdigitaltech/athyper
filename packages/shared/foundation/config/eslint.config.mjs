import tseslint from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...tseslint.configs.strict,
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/coverage/**"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
    },
  },
  // ADR-004 boundary rules — uncomment when eslint-plugin-import is installed.
  // See docs/architecture/004-dependency-rules.md for the full rule set.
];

export default config;
