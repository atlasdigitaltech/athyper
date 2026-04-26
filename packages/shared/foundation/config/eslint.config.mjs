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

  // ── ADR-004 §1 — entity-code branching guard (entity-runtime) ───────────────
  // Catches literal entity-code string comparisons inside entity-runtime.
  // These belong in display_config metadata, not inline conditionals.
  // Severity: error (blocks build) — these violate the metadata-driven contract.
  {
    files: ["packages/shared/runtime/entity-runtime/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "BinaryExpression[operator='==='][right.type='Literal'][right.raw=/^['\"]([a-z][a-z0-9_]*)['\"]$/]",
          message:
            "ADR-004: do not branch on entity codes in entity-runtime — " +
            "encode rendering decisions in display_config metadata instead.",
        },
      ],
    },
  },

  // ── ADR-004 §2 — CSS hygiene: no hardcoded palette classes ──────────────────
  // Blocks when Tailwind color utilities reference raw palette steps (e.g. bg-blue-500)
  // rather than semantic CSS-variable tokens (e.g. bg-primary, bg-success).
  // Severity: error (Phase D) — all known violations were resolved in Sprint 36.
  {
    files: ["packages/shared/**/*.{ts,tsx}", "apps/web/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/\\b(?:bg|text|border|ring)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)\\b/",
          message:
            "ADR-004 CSS: use semantic tokens (bg-primary, bg-success, text-muted-foreground, etc.) " +
            "instead of raw Tailwind palette steps.",
        },
      ],
    },
  },

  // ── ADR-004 §3 — banned directory names ─────────────────────────────────────
  // utils/, helpers/, common/, lib/ at any depth inside shared packages.
  // These are catch-all names that erode discoverability; use role-suffixed names.
  // Severity: error (Phase D) — _compat/ and _shared/ directories deleted.
  {
    files: [
      "packages/shared/**/utils/**/*.{ts,tsx}",
      "packages/shared/**/helpers/**/*.{ts,tsx}",
      "packages/shared/**/common/**/*.{ts,tsx}",
      "packages/shared/**/lib/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message:
            "ADR-004: avoid catch-all directory names (utils/, helpers/, common/, lib/). " +
            "Use role-suffixed directories: core/, client/, resolve/, registry/, etc.",
        },
      ],
    },
  },

  // ADR-004 full import-boundary rules — require eslint-plugin-import.
  // See docs/architecture/004-dependency-rules.md for the full rule set.
];

export default config;
