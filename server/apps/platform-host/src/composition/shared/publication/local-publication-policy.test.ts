import { expect, it } from "vitest";
import { parseLocalPublicationPolicy } from "./local-publication-policy.js";
import {
  parsePublicationPolicyProposal,
  parseEnrollablePublicationPolicy,
} from "./enrollment-contract.js";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const policyFixture = () => ({
  schema: "athyper.local-publication-policy/1",
  policyId: "local.test",
  revision: 1,
  authorPrincipalId: id(1),
  publisherPrincipalId: id(2),
  authority: {
    host: {
      environment: "local",
      instance: "dev",
      domainSuffix: "dev.athyper.test",
    },
    scope: { kind: "product" },
    validFrom: "2026-01-01T00:00:00Z",
    expiresAt: "2099-01-01T00:00:00Z",
    developerPrincipalIds: [id(3)],
    actions: ["publish", "retry", "recover", "rollback"],
    destinations: [
      { plane: "studio", instance: "dev" },
      { plane: "neon", instance: "dev" },
    ],
  },
});
it("enrolls reusable local scope without entering the legacy exact machine workflow", () => {
  const p = policyFixture();
  expect(parsePublicationPolicyProposal(p)).toEqual(p);
  expect(() => parseEnrollablePublicationPolicy(p)).toThrow();
});
it.each(["active", "hash", "enrollmentReceiptId"])(
  "rejects forged installed %s",
  (key) => {
    const p = policyFixture();
    Object.assign(p.authority, { [key]: true });
    expect(() => parseLocalPublicationPolicy(p)).toThrow();
  },
);
it("rejects QA in local runtime, actor overlap, unsupported scope and duplicate targets", () => {
  const qa = policyFixture();
  qa.authority.host.instance = "qa";
  expect(() => parseLocalPublicationPolicy(qa)).toThrow("DEV_ONLY");
  const overlap = policyFixture();
  overlap.authority.developerPrincipalIds = [overlap.publisherPrincipalId];
  expect(() => parseLocalPublicationPolicy(overlap)).toThrow();
  const tenant = policyFixture();
  tenant.authority.scope.kind = "tenant";
  expect(() => parseLocalPublicationPolicy(tenant)).toThrow();
  const targets = policyFixture();
  targets.authority.destinations.push(targets.authority.destinations[0]!);
  expect(() => parseLocalPublicationPolicy(targets)).toThrow();
});
