import { it, expect, vi } from "vitest";
import {
  createBusinessPartnerRequestService,
  type BusinessPartnerRequestServiceOptions,
} from "../business-partner-request-service.js";
const context = {
  planeKey: "neon",
  tenantId: "11111111-1111-4111-8111-111111111111",
  principalId: "22222222-2222-4222-8222-222222222222",
  requestId: "request",
};
const command = {
  context,
  kind: "new_partner",
  source: { kind: "manual" },
  registrationMode: "direct",
  idempotencyKey: "core-replay-test-0001",
  proposedPayload: {
    name: "Core Demo",
    partnerCategory: "organization",
    ownershipClass: "external",
  },
};
const schema = {
  code: "neon.business_partner_request.partner.new",
  version: 23,
  hash: "a".repeat(64),
  releaseId: "44444444-4444-4444-8444-444444444444",
};
it("uses immutable core creation evidence despite an evolved projection; conflicts never write", async () => {
  for (const matching of [true, false]) {
    const existing = {
      id: "existing",
      status: "applied",
      targetBusinessPartnerId: "materialized",
      proposedPayload: {
        ...command.proposedPayload,
        registrationChannel: "internal",
      },
      schema: { ...schema, code: "neon.business_partner.entity_case" },
    };
    const matchesCoreRegistrationCreation = vi.fn(async () => matching),
      create = vi.fn();
    const options = {
      repository: {
        findByIdempotencyKey: async () => existing,
        matchesCoreRegistrationCreation,
        create,
      },
      authorizer: { authorize: async () => ({ allowed: true }) },
      schemas: { resolve: async () => schema },
      transactions: {
        run: async (
          _plane: unknown,
          _actor: unknown,
          work: (tx: unknown) => unknown,
        ) => work({}),
      },
    } as unknown as BusinessPartnerRequestServiceOptions<unknown>;
    const service = createBusinessPartnerRequestService(options);
    if (matching)
      expect(await service.create(command as never)).toMatchObject({
        replayed: true,
        request: existing,
      });
    else
      await expect(service.create(command as never)).rejects.toMatchObject({
        code: "BUSINESS_PARTNER_REQUEST_IDEMPOTENCY_CONFLICT",
      });
    expect(matchesCoreRegistrationCreation).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
  }
});
