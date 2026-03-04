import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import importPlugin from "eslint-plugin-import";
import jsdoc from "eslint-plugin-jsdoc";
import reactHooks from "eslint-plugin-react-hooks";
import turbo from "eslint-plugin-turbo";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  /* ---------------------------
   * Ignore patterns
   * --------------------------- */
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/out/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/generated/**",
      "**/prisma/migrations/**",
      "**/temp/**",
      "**/next-env.d.ts",
    ],
  },

  /* ---------------------------
   * Base JS rules
   * --------------------------- */
  js.configs.recommended,

  /* ---------------------------
   * TypeScript
   * --------------------------- */
  ...tseslint.configs.recommended,

  /* ---------------------------
   * Project Rules (Global)
   * --------------------------- */
  {
    plugins: {
      import: importPlugin,
      jsdoc,
      "unused-imports": unusedImports,
      turbo,
      boundaries,
      "react-hooks": reactHooks,
    },

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },

    settings: {
      "import/resolver": {
        node: true,
        typescript: {
          // point to REAL files that exist in your repo
          project: [
            "./tooling/tsconfig/base.json",
            "./tooling/tsconfig/next.json",
          ],
        },
      },

      // Boundaries classification
      "boundaries/elements": [
        {
          type: "core",
          pattern: ["framework/core/src/**", "framework/core/dist/**"],
        },
        {
          type: "runtime",
          pattern: ["framework/runtime/src/**", "framework/runtime/dist/**"],
        },
        {
          type: "adapter",
          pattern: [
            "framework/adapters/*/src/**",
            "framework/adapters/*/dist/**",
          ],
        },
        { type: "pkg", pattern: ["packages/*/src/**", "packages/*/dist/**"] },
        { type: "product", pattern: "products/*/apps/*/**" },

        // product-internal shared libs (auth, ui, content, themes within a product)
        { type: "product-lib", pattern: "products/neon/!(apps)/**" },

        // tooling config packages (not part of architecture layers)
        { type: "tooling", pattern: "tooling/**" },
        { type: "tool", pattern: "tools/*/src/**" },
      ],
    },

    rules: {
      /* ---------------------------
       * Code Quality
       * --------------------------- */
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "error",

      /* ---------------------------
       * Imports
       * --------------------------- */
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            "type",
          ],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import/no-duplicates": "error",
      "import/no-cycle": "warn",

      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      /* ---------------------------
       * TypeScript
       * --------------------------- */
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],

      /* ---------------------------
       * JSDoc
       * --------------------------- */
      "jsdoc/require-description": [
        "warn",
        {
          contexts: ["TSInterfaceDeclaration", "TSTypeAliasDeclaration"],
        },
      ],

      /* ---------------------------
       * React Hooks
       * --------------------------- */
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      /* ---------------------------
       * Turbo
       * --------------------------- */
      "turbo/no-undeclared-env-vars": "error",

      /* ---------------------------
       * Athyper Discipline (Boundaries)
       * --------------------------- */
      "boundaries/no-unknown": "error",
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            // core is pure
            { from: "core", allow: ["core"] },

            // runtime orchestrates
            { from: "runtime", allow: ["runtime", "core", "adapter"] },

            // adapters touch infra
            { from: "adapter", allow: ["adapter", "core"] },

            // packages = reusable libs (no framework imports)
            { from: "pkg", allow: ["pkg"] },

            // products = deployables (packages + product-internal libs)
            { from: "product", allow: ["product", "pkg", "product-lib"] },
            { from: "product-lib", allow: ["product-lib", "pkg"] },

            // tooling and tools can be flexible
            {
              from: "tooling",
              allow: [
                "tooling",
                "tool",
                "pkg",
                "core",
                "adapter",
                "runtime",
                "product",
              ],
            },
            { from: "tool", allow: ["tool", "pkg", "core"] },
          ],
        },
      ],
    },
  },

  /* ---------------------------
   * Next.js Apps
   * --------------------------- */
  {
    files: ["products/*/apps/*/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-console": "off",
    },
  },

  /* ---------------------------
   * CLI Tools (console output is intentional)
   * --------------------------- */
  {
    files: ["tools/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    rules: {
      "no-console": "off",
    },
  },

  /* ---------------------------
   * CommonJS tooling / legacy config files
   * --------------------------- */
  {
    files: ["tooling/**/*.js", "**/.eslintrc.js", "**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        module: "writable",
        exports: "writable",
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        process: "readonly",
        console: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  /* ---------------------------
   * Node / Config / Script Files
   * --------------------------- */
  {
    files: [
      "**/*.config.{js,ts,mjs,cjs}",
      "**/scripts/**/*.{js,ts,mjs,cjs}",
      "**/*.{mjs,cjs}",
    ],
    languageOptions: {
      globals: {
        process: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        fetch: "readonly",
        Request: "readonly",
        Response: "readonly",
        Headers: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
      },
    },
    rules: {
      "no-console": "off",
    },
  },

  /* ---------------------------
   * Strict no-any in cleaned packages
   * --------------------------- */
  {
    files: [
      "framework/core/src/**/*.{ts,tsx}",
      "packages/ui/src/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  /* ---------------------------
   * Extra safety nets (specifier-based)
   * --------------------------- */

  // CORE: must not import runtime/adapters/packages/products by package name
  {
    files: ["framework/core/src/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@athyper/runtime",
            "@athyper/adapter-*",
            "@athyper/*", // blocks all packages by default from core
            "products/*",
            "framework/runtime/*",
            "framework/adapters/*",
          ],
        },
      ],
    },
  },

  // RUNTIME: disallow deep importing adapter internals (force package entrypoints)
  {
    files: ["framework/runtime/src/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "framework/adapters/*/src/*",
            "@athyper/adapter-*/src/*",
            "@athyper/adapter-*/dist/*",
          ],
        },
      ],
    },
  },

  // PACKAGES + PRODUCTS: must not import framework packages at all
  {
    files: [
      "packages/*/src/**/*.{ts,tsx,js,jsx}",
      "products/*/apps/*/**/*.{ts,tsx,js,jsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@athyper/core",
            "@athyper/runtime",
            "@athyper/adapter-*",

            // forbid prisma anywhere in UI/shared libs
            "@prisma/client",
            "prisma",
            "**/prisma/**",

            // forbid deep imports into workspace internals
            "@athyper/*/src/*",
            "@athyper/*/dist/*",
          ],
        },
      ],
    },
  },

  // NEXT.JS API ROUTES + server-side lib: allow framework imports (server-side code)
  {
    files: [
      "products/*/apps/*/app/api/**/*.{ts,tsx}",
      "products/*/apps/*/lib/db.ts",
      "products/*/apps/*/lib/api-context.ts",
    ],
    rules: {
      "no-restricted-imports": "off",
      "boundaries/element-types": "off",
      "boundaries/no-unknown": "off",
    },
  },
];
