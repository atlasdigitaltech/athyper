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

  // ── RUNTIME_ROUTING_SPEC §2 — entity.kind routing guard ──────────────────
  // Scoped to packages that make routing decisions so the rule doesn't produce
  // false positives in unrelated code (admin forms, print templates, etc.)
  // that legitimately use other "kind" properties.
  //
  // Catches: switch (x.kind) { ... } inside routing / runtime packages.
  // Fix  : use resolveRuntimeFamily(entity) or resolveDetailRenderer(entity).
  {
    files: [
      "packages/shared/data/metadata-client/src/**/*.ts",
      "packages/shared/runtime/entity-runtime/src/**/*.tsx",
      "apps/web/app/(shell)/**/*.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "SwitchStatement[discriminant.type='MemberExpression'][discriminant.property.name='kind']",
          message:
            "RUNTIME_ROUTING_SPEC §2: never switch on entity.kind — " +
            "use resolveRuntimeFamily() or resolveDetailRenderer() instead.",
        },
        {
          selector:
            "IfStatement > BinaryExpression[operator='==='][left.type='MemberExpression'][left.property.name='kind']",
          message:
            "RUNTIME_ROUTING_SPEC §2: never branch on entity.kind — " +
            "use resolveRuntimeFamily() or resolveDetailRenderer() instead.",
        },
      ],
    },
  },

  // ADR-004 boundary rules — uncomment when eslint-plugin-import is installed.
  // See docs/architecture/004-dependency-rules.md for the full rule set.
];

export default config;
