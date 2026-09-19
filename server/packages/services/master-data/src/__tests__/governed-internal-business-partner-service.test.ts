import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  GovernedEntityCaseResult,
  GovernedInternalBusinessPartnerCaseRepository,
} from "@athyper/server-contract-master-data";
import { describe, expect, it } from "vitest";
import { createGovernedInternalBusinessPartnerCaseService } from "../governed-internal-business-partner-service.js";

const context = {
  planeKey: "neon",
  tenantId: "11111111-1111-4111-8111-111111111111",
  principalId: "22222222-2222-4222-8222-222222222222",
  requestId: "33333333-3333-4333-8333-333333333333",
  profileHash: "profile",
  permissions: { allowed: [] },
} as unknown as VerifiedRequestContext;
const result: GovernedEntityCaseResult = {
  caseId: "44444444-4444-4444-8444-444444444444",
  snapshotId: "55555555-5555-4555-8555-555555555555",
  rowVersion: 1,
  status: "draft",
  replayed: false,
  outboxId: "66666666-6666-4666-8666-666666666666",
};

function fixture(allowed = true) {
  const calls: string[] = [],
    permissions: string[] = [];
  const repository: GovernedInternalBusinessPartnerCaseRepository<object> = {
    async createDraft() {
      calls.push("draft");
      return result;
    },
    async transition(command) {
      calls.push(command.action);
      return {
        ...result,
        rowVersion: command.expectedVersion + 1,
        status:
          command.action === "submit"
            ? "submitted"
            : command.action === "approve"
              ? "approved"
              : "rejected",
      };
    },
    async materialize() {
      calls.push("materialize");
      return {
        ...result,
        rowVersion: 4,
        status: "materialized",
        businessPartnerId: "77777777-7777-4777-8777-777777777777",
      };
    },
  };
  const service = createGovernedInternalBusinessPartnerCaseService({
    repository,
    authorizer: {
      async authorize(input) {
        permissions.push(input.permissionCode);
        return { allowed };
      },
    },
    transactions: {
      async run(plane, actor, work) {
        expect(plane).toBe("neon");
        expect(actor).toMatchObject({
          tenantId: context.tenantId,
          principalId: context.principalId,
        });
        return work({});
      },
    },
  });
  return { service, calls, permissions };
}

describe("governed internal Business Partner case service", () => {
  it("routes draft, cycle lifecycle, and materialization through their governed command owner", async () => {
    const value = fixture(),
      common = {
        context,
        caseId: result.caseId,
        idempotencyKey: "governed-command-001",
      };
    await value.service.createDraft({
      ...common,
      caseCode: "BP.INTERNAL.001",
      entityContractId: "88888888-8888-4888-8888-888888888888",
      entityContractHash: "a".repeat(64),
      formTemplateReleaseId: "99999999-9999-4999-8999-999999999999",
      formTemplateReleaseNo: 3,
      formTemplateHash: "b".repeat(64),
      payload: {
        businessPartnerCode: "BP.INTERNAL.001",
        name: "Internal",
        ownershipClass: "internal",
      },
    });
    await value.service.transition({
      ...common,
      action: "submit",
      expectedVersion: 1,
      cycleRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      cycleTaskId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    await value.service.transition({
      ...common,
      idempotencyKey: "governed-command-002",
      action: "approve",
      expectedVersion: 2,
      cycleRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      cycleTaskId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    await value.service.materialize({
      ...common,
      idempotencyKey: "governed-command-003",
      expectedVersion: 3,
    });
    expect(value.calls).toEqual(["draft", "submit", "approve", "materialize"]);
    expect(value.permissions).toEqual([
      "neon.relationship.entity_case.create",
      "neon.relationship.entity_case.submit",
      "neon.relationship.entity_case.decide",
      "neon.relationship.entity_case.materialize",
    ]);
  });

  it("denies before opening a transaction", async () => {
    const value = fixture(false);
    await expect(
      value.service.materialize({
        context,
        caseId: result.caseId,
        expectedVersion: 3,
        idempotencyKey: "governed-command-003",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(value.calls).toEqual([]);
  });
});
