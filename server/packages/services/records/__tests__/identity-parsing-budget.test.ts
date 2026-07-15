import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routesDir = resolve(import.meta.dirname, "../routes");
const sources = readdirSync(routesDir)
  .filter((name) => name.endsWith(".ts") && name !== "index.ts")
  .map((name) => readFileSync(resolve(routesDir, name), "utf8"))
  .join("\n");

// Phase 1 migration ratchet (2026-07-14). The canonical boundary in index.ts
// is intentionally excluded. Lower each ceiling as legacy handlers migrate;
// never raise a ceiling or add raw identity parsing to a new route.
const CEILINGS = {
  verifyBearer: 57,
  rawOrgHeader: 28,
  resolveTenant: 56,
  resolvePrincipal: 31,
} as const;

describe("records route identity-parsing budget", () => {
  it("does not add authentication or tenant/principal parsing below the canonical boundary", () => {
    const counts = {
      verifyBearer: (sources.match(/verifyBearer\(/g) ?? []).length,
      rawOrgHeader: (sources.match(/req\.headers\["x-org"\]/g) ?? []).length,
      resolveTenant: (sources.match(/resolveTenantId\(/g) ?? []).length,
      resolvePrincipal: (sources.match(/resolvePrincipalId(?:OrNull|WithJit)\(/g) ?? []).length,
    };

    for (const key of Object.keys(CEILINGS) as Array<keyof typeof CEILINGS>) {
      expect(counts[key], key).toBeLessThanOrEqual(CEILINGS[key]);
    }
  });
});
