import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Server workspaces publish dist/* for containers, but unit tests execute
    // directly from a source checkout where those artifacts may not exist yet.
    // Exact-match aliases keep tests on the public package boundary without
    // requiring a full monorepo build before Vitest can collect a suite.
    alias: [
      { find: /^@athyper\/adapter-auth$/, replacement: resolve(import.meta.dirname, "packages/adapters/auth/src/index.ts") },
      { find: /^@athyper\/adapter-crypto-local$/, replacement: resolve(import.meta.dirname, "packages/adapters/crypto-local/src/index.ts") },
      { find: /^@athyper\/adapter-db-core$/, replacement: resolve(import.meta.dirname, "packages/adapters/database/core/src/index.ts") },
      { find: /^@athyper\/adapter-db-neon$/, replacement: resolve(import.meta.dirname, "packages/adapters/database/neon-postgres/src/index.ts") },
      { find: /^@athyper\/adapter-db-athyper$/, replacement: resolve(import.meta.dirname, "packages/adapters/database/athyper-postgres/src/index.ts") },
      { find: /^@athyper\/adapter-db-mesh$/, replacement: resolve(import.meta.dirname, "packages/adapters/database/mesh-postgres/src/index.ts") },
      { find: /^@athyper\/adapter-memory-cache$/, replacement: resolve(import.meta.dirname, "packages/adapters/memory-cache/src/index.ts") },
      { find: /^@athyper\/adapter-object-storage$/, replacement: resolve(import.meta.dirname, "packages/adapters/object-storage/src/index.ts") },
      { find: /^@athyper\/adapter-rendering-gotenberg$/, replacement: resolve(import.meta.dirname, "packages/adapters/rendering/gotenberg/src/index.ts") },
      { find: /^@athyper\/adapter-rendering-legacy$/, replacement: resolve(import.meta.dirname, "packages/adapters/rendering/legacy-pdf-renderer/src/index.ts") },
      { find: /^@athyper\/adapter-telemetry$/, replacement: resolve(import.meta.dirname, "packages/adapters/telemetry/src/index.ts") },
      { find: /^@athyper\/adapter-telemetry\/cronwatch$/, replacement: resolve(import.meta.dirname, "packages/adapters/telemetry/src/cronwatch/index.ts") },
      { find: /^@athyper\/adapter-telemetry\/sentry$/, replacement: resolve(import.meta.dirname, "packages/adapters/telemetry/src/sentry/index.ts") },
      { find: /^@athyper\/foundation-kernel\/resilience$/, replacement: resolve(import.meta.dirname, "packages/foundation/kernel/src/resilience/index.ts") },
      { find: /^@athyper\/foundation-observability$/, replacement: resolve(import.meta.dirname, "packages/foundation/observability/src/index.ts") },
      { find: /^@athyper\/plane-neon-document-rendering$/, replacement: resolve(import.meta.dirname, "packages/planes/neon/document-rendering/src/index.ts") },
      { find: /^@athyper\/platform-core$/, replacement: resolve(import.meta.dirname, "../packages/platform/foundation/core/src/index.ts") },
      { find: /^@athyper\/platform-core\/telemetry$/, replacement: resolve(import.meta.dirname, "../packages/platform/foundation/core/src/telemetry/index.ts") },
      { find: /^@athyper\/server-foundation\/monitoring\/platform-metrics$/, replacement: resolve(import.meta.dirname, "packages/foundation/monitoring/platform-metrics.ts") },
      { find: /^@athyper\/svc-shared\/bootstrap$/, replacement: resolve(import.meta.dirname, "packages/services/shared/bootstrap.ts") },
      { find: /^@athyper\/svc-shared\/route-helpers$/, replacement: resolve(import.meta.dirname, "packages/services/shared/route-helpers.ts") },
      { find: /^@athyper\/svc-shared$/, replacement: resolve(import.meta.dirname, "packages/services/shared/index.ts") },
      { find: /^@athyper\/svc-collab$/, replacement: resolve(import.meta.dirname, "packages/platform/collaboration/index.ts") },
      { find: /^@athyper\/svc-iam$/, replacement: resolve(import.meta.dirname, "packages/platform/iam/index.ts") },
      { find: /^@athyper\/svc-jobs$/, replacement: resolve(import.meta.dirname, "packages/platform/jobs/index.ts") },
      { find: /^@athyper\/svc-numbering-runtime$/, replacement: resolve(import.meta.dirname, "packages/services/numbering-runtime/index.ts") },
      { find: /^@athyper\/plane-athyper-onboarding$/, replacement: resolve(import.meta.dirname, "packages/planes/athyper/onboarding/index.ts") },
      { find: /^@athyper\/svc-publication$/, replacement: resolve(import.meta.dirname, "packages/services/publication/index.ts") },
      { find: /^@athyper\/runtime-http$/, replacement: resolve(import.meta.dirname, "packages/runtime/http/src/index.ts") },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    include: [
      "src/**/__tests__/**/*.test.ts",
      "packages/runtime/**/__tests__/**/*.test.ts",
      "packages/adapters/db/src/**/__tests__/**/*.test.ts",
      "packages/planes/**/__tests__/**/*.test.ts",
      "packages/services/**/__tests__/**/*.test.ts",
      "packages/platform/**/__tests__/**/*.test.ts",
    ],
  },
});
