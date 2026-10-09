import { describe, expect, it } from "vitest";
import {
  assertLocalDevelopmentAuthority,
  type LocalDevelopmentAuthority,
  type LocalPublicationAdmission,
} from "./local-development-authority.js";
const host = {
  environment: "local",
  instance: "dev",
  domainSuffix: "dev.athyper.test",
};
const now = Date.parse("2026-10-09T00:00:00Z");
function fixture() {
  const authority: LocalDevelopmentAuthority = {
    schema: "athyper.local-development-authority/1",
    id: "authority",
    version: 1,
    hash: "a".repeat(64),
    active: true,
    validFrom: "2026-10-01T00:00:00Z",
    expiresAt: "2026-11-01T00:00:00Z",
    enrollmentReceiptId: "real-enrollment",
    host,
    scope: { kind: "product" },
    developerPrincipalIds: ["developer"],
    authorWorkloadId: "submitter",
    publisherWorkloadId: "publisher",
    actions: ["publish", "retry", "recover", "rollback"],
    destinations: [
      { plane: "neon", instance: "dev" },
      { plane: "mesh", instance: "dev" },
    ],
  };
  const request: LocalPublicationAdmission = {
    host,
    developerPrincipalId: "developer",
    authorWorkloadId: "submitter",
    publisherWorkloadId: "publisher",
    scope: { kind: "product" },
    action: "publish",
    targets: [{ plane: "neon", instance: "dev" }],
  };
  return { authority, request };
}
describe("local development authority", () => {
  it.each(["publish", "retry", "recover", "rollback"] as const)(
    "admits %s without a per-action human receipt",
    (action) => {
      const { authority, request } = fixture();
      expect(() =>
        assertLocalDevelopmentAuthority(authority, { ...request, action }, now),
      ).not.toThrow();
    },
  );
  it.each([
    { ...host, instance: "qa", domainSuffix: "qa.athyper.test" },
    { ...host, instance: "qa" },
    { ...host, domainSuffix: "qa.athyper.test" },
    { ...host, environment: "production" },
  ])("rejects nonlocal host %j", (denied) => {
    const { authority, request } = fixture();
    expect(() =>
      assertLocalDevelopmentAuthority(
        authority,
        { ...request, host: denied },
        now,
      ),
    ).toThrow("DEV_ONLY");
  });
  it("rechecks revocation on each use", () => {
    const { authority, request } = fixture();
    assertLocalDevelopmentAuthority(authority, request, now);
    expect(() =>
      assertLocalDevelopmentAuthority(
        { ...authority, active: false },
        request,
        now,
      ),
    ).toThrow("REVOKED");
  });
  it.each(["2026-09-30T00:00:00Z", "2026-11-01T00:00:00Z"])(
    "rejects outside authority validity %s",
    (date) => {
      const { authority, request } = fixture();
      expect(() =>
        assertLocalDevelopmentAuthority(authority, request, Date.parse(date)),
      ).toThrow("EXPIRED");
    },
  );
  it("does not confuse a workload with the initiating developer", () => {
    const { authority, request } = fixture();
    expect(() =>
      assertLocalDevelopmentAuthority(
        { ...authority, developerPrincipalIds: ["publisher"] },
        { ...request, developerPrincipalId: "publisher" },
        now,
      ),
    ).toThrow("ACTOR_MISMATCH");
  });
  it("rejects unenrolled developer, action, tenant and destination", () => {
    const { authority, request } = fixture();
    expect(() =>
      assertLocalDevelopmentAuthority(
        authority,
        { ...request, developerPrincipalId: "other" },
        now,
      ),
    ).toThrow("DEVELOPER_DENIED");
    expect(() =>
      assertLocalDevelopmentAuthority(
        { ...authority, actions: ["publish"] },
        { ...request, action: "rollback" },
        now,
      ),
    ).toThrow("ACTION_DENIED");
    expect(() =>
      assertLocalDevelopmentAuthority(
        authority,
        { ...request, scope: { kind: "tenant", tenantId: "other" } },
        now,
      ),
    ).toThrow("SCOPE_DENIED");
    expect(() =>
      assertLocalDevelopmentAuthority(
        authority,
        { ...request, targets: [{ plane: "neon", instance: "qa" }] },
        now,
      ),
    ).toThrow("TARGET_DENIED");
  });
  it("rejects duplicate destinations and an invalid stored authority", () => {
    const { authority, request } = fixture();
    expect(() =>
      assertLocalDevelopmentAuthority(
        authority,
        { ...request, targets: [...request.targets, ...request.targets] },
        now,
      ),
    ).toThrow("TARGET_DENIED");
    expect(() =>
      assertLocalDevelopmentAuthority(
        { ...authority, enrollmentReceiptId: "" },
        request,
        now,
      ),
    ).toThrow("INVALID");
  });
});
