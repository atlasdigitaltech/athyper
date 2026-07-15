import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(import.meta.dirname, "../route-helpers.ts"), "utf8");
const start = source.indexOf("export async function resolveVerifiedRequestContext(");
const end = source.indexOf("export async function resolveAttachmentAuthContext(", start);
const resolver = source.slice(start, end);

describe("verified request identity resolution policy", () => {
  it("resolves binding, active principal, and auth epoch in one principal query", () => {
    expect(resolver).toContain('.selectFrom("master.principal_identity_binding as pab")');
    expect(resolver).toContain('.innerJoin("master.principal as p"');
    expect(resolver).toContain('"p.auth_epoch"');
    expect(resolver).toContain("authEpoch:");
    expect(resolver).not.toContain("resolvePrincipalIdOrNull(");
  });

  it("accepts only the explicitly trusted host tenant shortcut", () => {
    expect(resolver).toContain("normalizeClaimString(hints.trustedTenantId)");
    expect(resolver).toContain("hintedTenantId");
    expect(resolver).toContain("AUTH_CONTEXT_MISMATCH");
  });
});
