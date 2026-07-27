import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(import.meta.dirname, "../routes/records.route.ts"), "utf8");
const index = readFileSync(resolve(import.meta.dirname, "../routes/index.ts"), "utf8");
const actionDispatcher = readFileSync(resolve(import.meta.dirname, "../routes/action-dispatcher.route.ts"), "utf8");
const lifecycle = readFileSync(resolve(import.meta.dirname, "../routes/lifecycle.route.ts"), "utf8");

function section(start: string, end: string): string {
  const from = route.indexOf(start);
  const to = route.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return route.slice(from, to);
}

describe("canonical records request-context boundary", () => {
  it("composes verified identity and effective permissions before mounting handlers", () => {
    expect(index).toContain("resolveVerifiedRequestContext(");
    expect(index).toContain("ensureEffectivePermissionContext(");
    expect(index).toContain("composeVerifiedRequestContext({");
    expect(index).toContain("storeVerifiedRequestContext(res, canonical.context)");
    expect(index).toContain("deps.onVerifiedContext?.(canonical.context)");
    expect(index).toContain("trustedTenantId: authenticated?.tenantId");
    expect(index).toContain("req as typeof req & { athyperClaims?: Record<string, unknown> }");
    expect(index.indexOf("router.use(verifiedRequestContext)")).toBeLessThan(index.indexOf("createRecordsRoute(router, deps)"));
  });

  it.each([
    ["generic list", "const listHandler: RequestHandler", "const getHandler: RequestHandler"],
    ["generic detail", "const getHandler: RequestHandler", "const createHandler: RequestHandler"],
    ["generic POST", "const createHandler: RequestHandler", "const updateHandler: RequestHandler"],
    ["generic PUT", "const updateHandler: RequestHandler", "const recordStreamHandler: RequestHandler"],
    ["document workspace actor", "async function resolveDocumentEditMutationActor", "function readDocumentEditExpectedVersion"],
    ["generic PATCH", "const patchHandler: RequestHandler", "const deleteHandler: RequestHandler"],
    ["generic DELETE", "const deleteHandler: RequestHandler", "const debugHandler: RequestHandler"],
    ["lock acquire", "const acquireLockHandler: RequestHandler", "const getLockHandler: RequestHandler"],
    ["lock read", "const getLockHandler: RequestHandler", "const renewLockHandler: RequestHandler"],
    ["lock renew", "const renewLockHandler: RequestHandler", "const releaseLockHandler: RequestHandler"],
    ["lock release", "const releaseLockHandler: RequestHandler", "const forceReleaseLockHandler: RequestHandler"],
    ["lock force release", "const forceReleaseLockHandler: RequestHandler", "const entityOpHandler: RequestHandler"],
    ["entity operation", "const entityOpHandler: RequestHandler", "return router;"],
  ])("uses the canonical context in %s", (_name, start, end) => {
    const handler = section(start, end);
    expect(handler).toContain("requireVerifiedContext(req, res)");
    expect(handler).not.toContain("verifyBearer(");
    expect(handler).not.toContain('req.headers["x-org"]');
    expect(handler).not.toContain("resolveTenantId(");
    expect(handler).not.toContain("resolvePrincipalIdOrNull(");
    expect(handler).not.toContain("resolvePrincipalIdWithJit(");
  });

  it("uses the canonical context in action transitions and lifecycle reads", () => {
    for (const source of [actionDispatcher, lifecycle]) {
      expect(source).toContain("requireVerifiedContext(req, res)");
      expect(source).not.toContain("verifyBearer(");
      expect(source).not.toContain("resolveVerifiedRequestContext(");
      expect(source).not.toContain("resolveTenantId(");
      expect(source).not.toContain('req.headers["x-org"]');
    }
  });
});
