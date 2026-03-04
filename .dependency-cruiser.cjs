/* eslint-disable */
// @ts-nocheck
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
    forbidden: [
        /**
         * ─────────────────────────────────────────────
         * NO CIRCULAR DEPENDENCIES
         * ─────────────────────────────────────────────
         */
        {
            name: "no-circular",
            severity: "error",
            comment: "Circular dependencies lead to hard-to-debug issues and tight coupling",
            from: {},
            to: { circular: true }
        },

        /**
         * ─────────────────────────────────────────────
         * CORE IS PURE (BUT MAY USE CONTRACTS)
         * ─────────────────────────────────────────────
         */
        {
            name: "core-no-infra",
            severity: "error",
            from: { path: "^framework/core" },
            to: {
                path: [
                    "^framework/runtime",
                    "^framework/adapters",
                    "^packages(?!/contracts)",   // allow packages/contracts ONLY
                    "^products",
                    "node_modules/(pg|ioredis|@aws-sdk|express|pino|jose)"
                ]
            }
        },

        /**
         * ─────────────────────────────────────────────
         * RUNTIME ORCHESTRATES (NO DIRECT INFRA)
         * ─────────────────────────────────────────────
         */
        {
            name: "runtime-no-direct-infra",
            severity: "error",
            comment: "Runtime orchestrates via adapters. Exceptions: kernel logger (pino) and CLI migrate (pg, ioredis).",
            from: {
                path: "^framework/runtime",
                pathNot: [
                    "^framework/runtime/src/kernel/logger\\.ts$",
                    "^framework/runtime/src/cli/migrate\\.ts$"
                ]
            },
            to: {
                path: "node_modules/(pg|ioredis|@aws-sdk|pino|redis|minio)"
            }
        },

        /**
         * ─────────────────────────────────────────────
         * ADAPTERS TOUCH INFRA, NO CROSS-TALK
         * ─────────────────────────────────────────────
         */
        {
            name: "adapter-auth-no-cross-talk",
            severity: "error",
            from: { path: "^framework/adapters/auth/" },
            to: { path: "^framework/adapters/(db|memorycache|objectstorage|telemetry)/" }
        },
        {
            name: "adapter-db-no-cross-talk",
            severity: "error",
            from: { path: "^framework/adapters/db/" },
            to: { path: "^framework/adapters/(auth|memorycache|objectstorage|telemetry)/" }
        },
        {
            name: "adapter-memorycache-no-cross-talk",
            severity: "error",
            from: { path: "^framework/adapters/memorycache/" },
            to: { path: "^framework/adapters/(auth|db|objectstorage|telemetry)/" }
        },
        {
            name: "adapter-objectstorage-no-cross-talk",
            severity: "error",
            from: { path: "^framework/adapters/objectstorage/" },
            to: { path: "^framework/adapters/(auth|db|memorycache|telemetry)/" }
        },
        {
            name: "adapter-telemetry-no-cross-talk",
            severity: "error",
            from: { path: "^framework/adapters/telemetry/" },
            to: { path: "^framework/adapters/(auth|db|memorycache|objectstorage)/" }
        },

        /**
         * ─────────────────────────────────────────────
         * ADAPTERS MAY ONLY USE CONTRACT PACKAGES
         * ─────────────────────────────────────────────
         */
        {
            name: "adapters-no-packages-except-contracts",
            severity: "error",
            from: { path: "^framework/adapters/" },
            to: { path: "^packages(?!/contracts)" }
        },

        /**
         * ─────────────────────────────────────────────
         * PACKAGES ARE FRAMEWORK-INDEPENDENT
         * ─────────────────────────────────────────────
         */
        {
            name: "packages-no-framework",
            severity: "error",
            from: { path: "^packages" },
            to: { path: "^framework" }
        },

        /**
         * ─────────────────────────────────────────────
         * PRODUCTS USE PACKAGES & CONTRACTS ONLY
         * ─────────────────────────────────────────────
         */
        {
            name: "products-no-framework",
            severity: "error",
            from: { path: "^products" },
            to: { path: "^framework" }
        }
    ],

    options: {
        doNotFollow: { path: "node_modules" },
        exclude: { path: ["generated", "\\.prisma", "/dist/"] },
        tsConfig: { fileName: "tsconfig.json" },
        enhancedResolveOptions: {
            exportsFields: ["exports"],
            conditionNames: ["import", "default"]
        }
    }
};