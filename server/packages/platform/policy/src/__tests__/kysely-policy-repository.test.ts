import { expect, it } from "vitest";
import {
  createKyselyPolicyRepository,
  type PolicyTransaction,
} from "../kysely-policy-repository.js";

it("returns no policies for an explicit empty selection without querying all policies", async () => {
  const repository = createKyselyPolicyRepository();
  await expect(
    repository.findActive(
      {
        tenantId: "tenant",
        entityType: "order",
        effectiveOn: "2026-09-06",
        policyDefinitionIds: [],
      },
      {} as PolicyTransaction,
    ),
  ).resolves.toEqual([]);
});
