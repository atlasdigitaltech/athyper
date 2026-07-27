import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(import.meta.dirname, "../routes/entity-mutation.route.ts"), "utf8");
const compatibilityRoute = readFileSync(resolve(import.meta.dirname, "../routes/records.route.ts"), "utf8");
const repository = readFileSync(resolve(import.meta.dirname, "../repositories/entity-descriptor.repository.ts"), "utf8");

const SQL_IN_ROUTE = [
  /\bsql\s*`/,
  /\.selectFrom\s*\(/,
  /\.insertInto\s*\(/,
  /\.updateTable\s*\(/,
  /\.deleteFrom\s*\(/,
  /\.transaction\s*\(/,
];

describe("Phase 9 route and application layer boundaries", () => {
  it("keeps the extracted mutation route transport-only and below the route size budget", () => {
    expect(route.split(/\r?\n/).length).toBeLessThanOrEqual(500);
    for (const prohibited of SQL_IN_ROUTE) expect(route).not.toMatch(prohibited);
  });

  it("keeps each extracted mutation handler below 50 lines", () => {
    for (const [name, next] of [["create", "update"], ["update", "patch"], ["patch", "remove"], ["remove", "return"]] as const) {
      const start = route.indexOf(`const ${name}: RequestHandler`);
      const end = next === "return"
        ? route.indexOf("return { create, update, patch, remove }", start)
        : route.indexOf(`const ${next}: RequestHandler`, start);
      expect(start, `missing ${name} handler`).toBeGreaterThanOrEqual(0);
      expect(end, `missing end of ${name} handler`).toBeGreaterThan(start);
      expect(route.slice(start, end).split(/\r?\n/).length, `${name} handler`).toBeLessThanOrEqual(50);
    }
  });

  it("delegates canonical mutations from the compatibility composition module", () => {
    expect(compatibilityRoute).toContain("registerEntityMutationRoutes(router, {");
    expect(compatibilityRoute).not.toContain('router.post  ("/runtime/v1/entities/:entity",');
    expect(compatibilityRoute).not.toContain('router.patch ("/runtime/v1/entities/:entity/:id",');
    expect(compatibilityRoute).not.toContain('router.delete("/runtime/v1/entities/:entity/:id",');
  });

  it("keeps storage lookup in the descriptor repository", () => {
    expect(repository).toContain("class KyselyEntityDescriptorRepository");
    expect(repository).toContain(".selectFrom(");
    expect(repository).toContain('"e.identity_config"');
    expect(repository).not.toContain('"e.natural_key_fields"');
    expect(route).toContain("descriptors.resolveRecordId(");
  });

  it("requires verified context and never parses identity headers in the extracted route", () => {
    expect(route).toContain("requireVerifiedContext(req, res)");
    expect(route).not.toContain("verifyBearer(");
    expect(route).not.toContain('req.headers["x-org"]');
    expect(route).not.toContain('req.headers["x-realm"]');
    expect(route).not.toContain("resolveTenantId(");
  });
});
