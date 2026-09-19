import { expect } from "@playwright/test";
import { test } from "./bp-r7.fixture";

test("BP-WRK-001 publishes approved demand only to an eligible Supplier", async ({
  bpActors,
  r7,
}, testInfo) => {
  const idempotencyKey = `bp-r7-publish-${crypto.randomUUID()}`;
  const request = {
    idempotencyKey,
    expectedVersion: r7.expectedVersion,
    suppliers: [{ supplierId: r7.supplierId }],
  };
  const path = `/api/relay/neon/supplier-workforce/requisitions/${r7.requisitionId}/publications`;
  const published = await bpActors.approverPage.request.post(path, {
    headers: { "Idempotency-Key": idempotencyKey },
    data: request,
  });
  expect(published.status()).toBe(201);
  const proof = (await published.json()) as {
    requisition: { id: string; status: string; rowVersion: number };
    distributionIds: string[];
    outboxId: string;
    replayed: boolean;
  };
  expect(proof).toMatchObject({
    requisition: { id: r7.requisitionId, status: "released" },
    replayed: false,
  });
  expect(proof.distributionIds).toHaveLength(1);
  expect(proof.outboxId).toMatch(/^[0-9a-f-]{36}$/i);

  const replay = await bpActors.approverPage.request.post(path, {
    headers: { "Idempotency-Key": idempotencyKey },
    data: request,
  });
  expect(replay.status()).toBe(200);
  await expect(replay.json()).resolves.toMatchObject({
    distributionIds: proof.distributionIds,
    outboxId: proof.outboxId,
    replayed: true,
  });
  await testInfo.attach("bp-wrk-001-publication.json", {
    body: JSON.stringify(proof, null, 2),
    contentType: "application/json",
  });
});

test("BP-WRK-007/008/010 activates placement then atomically terminates and requests IAM deprovisioning", async ({
  bpActors,
  r7,
}, testInfo) => {
  const placementKey = `bp-r7-placement-${crypto.randomUUID()}`;
  const placementPath = `/api/relay/neon/supplier-workforce/engagements/${r7.engagementId}/placements`;
  const placementResponse = await bpActors.approverPage.request.post(
    placementPath,
    {
      headers: { "Idempotency-Key": placementKey },
      data: {
        idempotencyKey: placementKey,
        expectedVersion: r7.engagementVersion,
        effectiveFrom: r7.placementEffectiveFrom,
        companyCodeId: r7.companyCodeId,
        isPrimary: true,
      },
    },
  );
  expect(placementResponse.status()).toBe(201);
  const placement = (await placementResponse.json()) as {
    workerEngagementId: string;
    placementId: string;
    engagementVersion: number;
    outboxId: string;
    replayed: boolean;
  };
  expect(placement).toMatchObject({
    workerEngagementId: r7.engagementId,
    replayed: false,
  });
  expect(placement.placementId).toMatch(/^[0-9a-f-]{36}$/i);

  const terminationKey = `bp-r7-termination-${crypto.randomUUID()}`;
  const terminationPath = `/api/relay/neon/supplier-workforce/engagements/${r7.engagementId}/termination`;
  const terminationRequest = {
    idempotencyKey: terminationKey,
    expectedVersion: placement.engagementVersion,
    reasonCode: "QUALIFICATION_TEST_END",
    effectiveAt: new Date().toISOString(),
  };
  const terminationResponse = await bpActors.approverPage.request.post(
    terminationPath,
    {
      headers: { "Idempotency-Key": terminationKey },
      data: terminationRequest,
    },
  );
  expect(terminationResponse.status()).toBe(201);
  const termination = (await terminationResponse.json()) as {
    workerEngagementId: string;
    engagementVersion: number;
    iamOutboxId: string;
    iamDesiredHash: string;
    outboxId: string;
    replayed: boolean;
  };
  expect(termination).toMatchObject({
    workerEngagementId: r7.engagementId,
    replayed: false,
  });
  expect(termination.iamOutboxId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(termination.iamDesiredHash).toMatch(/^[a-f0-9]{64}$/);
  const replay = await bpActors.approverPage.request.post(terminationPath, {
    headers: { "Idempotency-Key": terminationKey },
    data: terminationRequest,
  });
  expect(replay.status()).toBe(200);
  await expect(replay.json()).resolves.toMatchObject({
    iamOutboxId: termination.iamOutboxId,
    iamDesiredHash: termination.iamDesiredHash,
    replayed: true,
  });
  await testInfo.attach("bp-wrk-007-008-010-lifecycle.json", {
    body: JSON.stringify({ placement, termination }, null, 2),
    contentType: "application/json",
  });
});
