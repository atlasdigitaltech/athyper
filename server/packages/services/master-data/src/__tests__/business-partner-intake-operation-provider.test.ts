import { describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  EntityIntakeOperationRequestV1,
  EntityIntakeSurfaceV1,
} from "@athyper/contract-platform-entity-runtime";
import { createBusinessPartnerIntakeCommandMapper } from "../business-partner-intake-command-mapper.js";
import { createBusinessPartnerIntakeOperationProvider } from "../business-partner-intake-operation-provider.js";
const org = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const context = {
  planeKey: "neon",
  tenantId: "tenant",
  principalId: "actor",
} as VerifiedRequestContext;
const input = (patch: Partial<EntityIntakeOperationRequestV1> = {}) => ({
  context,
  idempotencyKey: "idempotency-key-123",
  request: {
    schemaVersion: 1 as const,
    descriptorHash: "a".repeat(64),
    flowKey: "request_intake",
    operation: "save_draft" as const,
    answers: { requested_role: "supplier", organization: org, name: "Acme" },
    ...patch,
  },
});
function fixture() {
  const details: EntityIntakeSurfaceV1 = {
    schemaVersion: 1,
    key: "intake_details",
    title: "Details",
    columns: 1,
    sections: [
      {
        key: "main",
        fields: [
          {
            key: "organization",
            valueKey: "organization",
            control: "input",
            label: "Organization",
            widget: "text",
            required: true,
            columnSpan: 12,
            payload: { target: "context", path: "operatingOrganizationId" },
          },
          {
            key: "name",
            valueKey: "name",
            control: "input",
            label: "Name",
            widget: "text",
            required: true,
            columnSpan: 12,
            payload: { target: "canonical", path: "name" },
          },
        ],
      },
    ],
  };
  const partner: EntityIntakeSurfaceV1 = {
    schemaVersion: 1,
    key: "intake_partner",
    title: "Partner",
    columns: 1,
    sections: [
      {
        key: "role",
        fields: [
          {
            key: "requested_role",
            control: "choiceCards",
            label: "Role",
            options: [{ value: "supplier", label: "Supplier" }],
            required: true,
          },
        ],
      },
    ],
  };
  const saved = {
    id,
    requestNo: "BP-42",
    rowVersion: 2,
    createdAt: "2026-09-21T00:00:00.000Z",
    requestedRole: "supplier",
    kind: "new_partner",
    source: { kind: "manual" },
    operatingOrganizationId: org,
    proposedPayload: { name: "Acme" },
    status: "draft",
  };
  const requests = {
    get: vi.fn(async () => saved),
    create: vi.fn(async () => ({ request: saved })),
    patch: vi.fn(async () => saved),
    submit: vi.fn(async () => ({ request: { ...saved, rowVersion: 3 } })),
  };
  const descriptor = vi.fn(async () => ({
    revision: { descriptorHash: "a".repeat(64) },
    intakeSurfaces: [partner, details],
    intakeFlows: [{ key: "request_intake" }],
  }));
  const protect = vi.fn();
  const readPartner = vi.fn();
  const preview = vi.fn(async () => ({
    outcome: "reapproval-required" as const,
  }));
  const mapper = createBusinessPartnerIntakeCommandMapper({
    descriptor: descriptor as never,
    requests: requests as never,
    protect,
    readPartner,
    preview,
  });
  const provider = createBusinessPartnerIntakeOperationProvider({
    mapper,
    requests: requests as never,
  });
  return { requests, descriptor, mapper, provider, protect, readPartner };
}
describe("published BP intake provider", () => {
  it("maps declared answers into a governed draft command and returns the saved receipt", async () => {
    const f = fixture();
    const result = await f.provider.execute(input());
    expect(f.requests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        context,
        idempotencyKey: "idempotency-key-123",
        kind: "new_partner",
        requestedRole: "supplier",
        operatingOrganizationId: org,
        draftCapture: true,
        proposedPayload: expect.objectContaining({ name: "Acme" }),
      }),
    );
    expect(result.receipt).toMatchObject({
      code: "BP-42",
      recordId: id,
      version: 2,
    });
    expect(f.protect).not.toHaveBeenCalled();
  });
  it.each([
    { descriptorHash: "b".repeat(64) },
    { flowKey: "unpublished" },
    {
      answers: {
        requested_role: "supplier",
        organization: org,
        createdBy: "other",
      },
    },
    { answers: { requested_role: "customer", organization: org } },
  ])("rejects stale or undeclared input before mutation: %j", async (patch) => {
    const f = fixture();
    await expect(f.provider.execute(input(patch))).rejects.toThrow();
    expect(f.requests.create).not.toHaveBeenCalled();
    expect(f.requests.patch).not.toHaveBeenCalled();
    expect(f.requests.submit).not.toHaveBeenCalled();
  });
  it("rechecks saved version and read admission before submit", async () => {
    const f = fixture();
    await expect(
      f.provider.execute(
        input({
          operation: "submit",
          requestId: id,
          expectedVersion: 1,
          answers: {},
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.requests.submit).not.toHaveBeenCalled();
    const result = await f.provider.execute(
      input({
        operation: "submit",
        requestId: id,
        expectedVersion: 2,
        answers: {},
      }),
    );
    expect(f.requests.submit).toHaveBeenCalledWith({
      context,
      requestId: id,
      expectedVersion: 2,
      idempotencyKey: "idempotency-key-123",
    });
    expect(result.receipt).toMatchObject({
      statusLabel: "Submitted",
      version: 3,
    });
    expect(result.capabilities.map((c) => c.operation)).toEqual(["exit"]);
  });
  it("requires concurrency on updates and does not report unsupported discard as success", async () => {
    const f = fixture();
    await expect(
      f.provider.execute(input({ requestId: id })),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      f.provider.execute(input({ operation: "discard" })),
    ).rejects.toMatchObject({ status: 400 });
    expect(f.requests.patch).not.toHaveBeenCalled();
  });
  it("cannot use a saved request denied by the owning service", async () => {
    const f = fixture();
    f.requests.get.mockRejectedValue(new Error("access denied"));
    await expect(
      f.provider.execute(input({ requestId: id, expectedVersion: 2 })),
    ).rejects.toThrow("access denied");
    expect(f.requests.patch).not.toHaveBeenCalled();
  });
});
