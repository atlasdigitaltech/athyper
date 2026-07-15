// packages/shared/runtime-domain/runtime-contracts/src/__tests__/token-claims.test.ts
//
// Phase E unit tests â€” table-driven across valid and invalid token shapes.

import { describe, expect, it } from "vitest";

import {
  parseTokenClaims,
  parseTokenClaimsOrThrow,
  requiredActionsFromTokenClaims,
  type TokenClaims,
} from "../token-claims.js";

const VALID_UUID = "01900000-0000-7000-aaaa-000000000001";

function validClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sub: VALID_UUID,
    iss: "https://iam.athyper.local/realms/athyper",
    azp: "neon-web",
    exp: 1_700_000_000,
    iat: 1_699_996_400,
    tenant_id: VALID_UUID,
    allowed_tenants: ["acme", "globex"],
    required_actions: ["UPDATE_PASSWORD"],
    realm_access: { roles: ["NEON_USER"] },
    resource_access: { "neon-web": { roles: ["AUTHORIZED"] } },
    email: "user@example.com",
    name: "Sample User",
    ...overrides,
  };
}

// â”€â”€â”€ Happy path â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("parseTokenClaims â€” happy path", () => {
  it("accepts a fully populated valid token", () => {
    const result = parseTokenClaims(validClaims());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claims.sub).toBe(VALID_UUID);
    expect(result.claims.tenant_id).toBe(VALID_UUID);
    expect(result.claims.required_actions).toEqual(["UPDATE_PASSWORD"]);
    expect(result.claims.resource_access?.["neon-web"]?.roles).toEqual(["AUTHORIZED"]);
  });

  it("accepts a minimal token with only the three required claims", () => {
    const result = parseTokenClaims({
      sub: "user-123",
      iss: "https://iam.athyper.local/realms/athyper",
      azp: "neon-web",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts camelCase requiredActions as an alias", () => {
    const result = parseTokenClaims(
      validClaims({ required_actions: undefined, requiredActions: ["VERIFY_EMAIL"] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(requiredActionsFromTokenClaims(result.claims as TokenClaims)).toEqual(["VERIFY_EMAIL"]);
  });

  it("preserves extra unknown claims via passthrough", () => {
    const result = parseTokenClaims(validClaims({ custom_claim: "x", organizations: { a: {} } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.claims as unknown as Record<string, unknown>)["custom_claim"]).toBe("x");
  });
});

// â”€â”€â”€ Schema rejections â€” required fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("parseTokenClaims â€” required fields", () => {
  it("rejects missing sub with fieldPath=sub", () => {
    const result = parseTokenClaims(validClaims({ sub: undefined }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fieldPath).toBe("sub");
  });

  it("rejects empty sub", () => {
    const result = parseTokenClaims(validClaims({ sub: "" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fieldPath).toBe("sub");
  });

  it("rejects missing iss", () => {
    const result = parseTokenClaims(validClaims({ iss: undefined }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fieldPath).toBe("iss");
  });

  it("rejects non-URL iss with fieldPath=iss", () => {
    const result = parseTokenClaims(validClaims({ iss: "not-a-url" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fieldPath).toBe("iss");
  });

  it("rejects missing azp", () => {
    const result = parseTokenClaims(validClaims({ azp: undefined }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fieldPath).toBe("azp");
  });
});

// â”€â”€â”€ Schema rejections â€” typed-optional fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("parseTokenClaims â€” typed optional fields", () => {
  it("rejects tenant_id when not a UUID", () => {
    const result = parseTokenClaims(validClaims({ tenant_id: 42 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fieldPath).toBe("tenant_id");
  });

  it("rejects tenant_id when it is a non-UUID string", () => {
    const result = parseTokenClaims(validClaims({ tenant_id: "not-a-uuid" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fieldPath).toBe("tenant_id");
  });

  it("rejects allowed_tenants when it is not an array of strings", () => {
    const result = parseTokenClaims(validClaims({ allowed_tenants: [1, 2, 3] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fieldPath.startsWith("allowed_tenants")).toBe(true);
  });

  it("rejects required_actions of wrong shape", () => {
    const result = parseTokenClaims(validClaims({ required_actions: "UPDATE_PASSWORD" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fieldPath).toBe("required_actions");
  });

  it("rejects resource_access[clientId].roles when not string[]", () => {
    const result = parseTokenClaims(
      validClaims({ resource_access: { "neon-web": { roles: [1, 2] } } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fieldPath.startsWith("resource_access")).toBe(true);
  });

  it("rejects exp when negative", () => {
    const result = parseTokenClaims(validClaims({ exp: -1 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fieldPath).toBe("exp");
  });

  it("rejects exp when non-integer", () => {
    const result = parseTokenClaims(validClaims({ exp: 1.5 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fieldPath).toBe("exp");
  });
});

// â”€â”€â”€ Error shape â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("parseTokenClaims â€” structured error", () => {
  it("returns issues list with path and code for every failure", () => {
    const result = parseTokenClaims({ sub: 42, iss: "bad", azp: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe("token_claims_invalid");
    expect(result.error.issues.length).toBeGreaterThanOrEqual(2);
    for (const issue of result.error.issues) {
      expect(typeof issue.path).toBe("string");
      expect(typeof issue.message).toBe("string");
      expect(typeof issue.code).toBe("string");
    }
  });
});

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("requiredActionsFromTokenClaims", () => {
  it("prefers snake_case when both are present", () => {
    const result = parseTokenClaims(
      validClaims({ required_actions: ["A"], requiredActions: ["B"] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(requiredActionsFromTokenClaims(result.claims as TokenClaims)).toEqual(["A"]);
  });

  it("falls back to camelCase", () => {
    const result = parseTokenClaims(
      validClaims({ required_actions: undefined, requiredActions: ["B"] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(requiredActionsFromTokenClaims(result.claims as TokenClaims)).toEqual(["B"]);
  });

  it("returns empty array when neither is present", () => {
    const result = parseTokenClaims(
      validClaims({ required_actions: undefined, requiredActions: undefined }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(requiredActionsFromTokenClaims(result.claims as TokenClaims)).toEqual([]);
  });
});

describe("parseTokenClaimsOrThrow", () => {
  it("returns claims when valid", () => {
    const claims = parseTokenClaimsOrThrow(validClaims());
    expect(claims.sub).toBe(VALID_UUID);
  });

  it("throws when invalid", () => {
    expect(() => parseTokenClaimsOrThrow(validClaims({ tenant_id: 42 }))).toThrow(
      /tenant_id/,
    );
  });
});
