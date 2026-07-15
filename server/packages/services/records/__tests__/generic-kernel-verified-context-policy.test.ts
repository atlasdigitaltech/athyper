import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const records = readFileSync(resolve(import.meta.dirname, "../routes/records.route.ts"), "utf8");
const mutationAdapter = readFileSync(resolve(import.meta.dirname, "../routes/entity-mutation.route.ts"), "utf8");
const guard = readFileSync(resolve(import.meta.dirname, "../routes/entity-mutation-guard.ts"), "utf8");

function section(start: string, end: string): string {
  const from = records.indexOf(start);
  const to = records.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return records.slice(from, to);
}

const genericHandlers = [
  ["list", "const listHandler: RequestHandler", "const getHandler: RequestHandler"],
  ["detail", "const getHandler: RequestHandler", "const createHandler: RequestHandler"],
  ["create", "const createHandler: RequestHandler", "const updateHandler: RequestHandler"],
  ["update", "const updateHandler: RequestHandler", "const recordStreamHandler: RequestHandler"],
  ["aggregate submit", "const documentEditSubmitHandler: RequestHandler", "const patchHandler: RequestHandler"],
  ["patch", "const patchHandler: RequestHandler", "const deleteHandler: RequestHandler"],
  ["delete", "const deleteHandler: RequestHandler", "const debugHandler: RequestHandler"],
] as const;

describe("generic kernel verified-context policy", () => {
  it.each(genericHandlers)("forbids identity reconstruction in %s", (_name, start, end) => {
    const source = section(start, end);
    expect(source).toContain("requireVerifiedContext(req, res)");
    expect(source).not.toMatch(/verifyBearer\(|resolveTenantId\(|resolvePrincipalId(?:OrNull|WithJit)\(/);
    expect(source).not.toMatch(/req\.headers\["x-(?:org|realm|tenant|principal)/);
    expect(source).not.toMatch(/claims\[(?:"|')sub(?:"|')\]|claims\.sub/);
  });

  it("requires the route adapter before canonical and compatibility mutation branches", () => {
    expect(mutationAdapter).toContain("requireVerifiedContext(req, res)");
    expect(mutationAdapter).not.toContain("requireVerifiedRequestContext(");
    expect(mutationAdapter).not.toMatch(/verifyBearer\(|resolveTenantId\(|resolvePrincipalId/);
  });

  it("memoizes authorization promises by the immutable request context", () => {
    expect(guard).toContain("new WeakMap<");
    expect(guard).toContain("authorizationContext.authEpoch");
    expect(guard).toContain("authorizationContext.profileHash");
    expect(guard).toContain("memo.set(key, pending)");
  });
});
