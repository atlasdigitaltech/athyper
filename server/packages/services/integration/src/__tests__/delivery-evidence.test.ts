import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type {
  Delivery,
  DeliveryAttemptEvidence,
  IntegrationRepository,
} from "@athyper/server-contract-integration";
import { createIntegrationDeliveryHandler, sha256 } from "../index.js";

const delivery: Delivery = {
  id: "33333333-3333-4333-8333-333333333333",
  tenantId: "11111111-1111-4111-8111-111111111111",
  endpointId: "44444444-4444-4444-8444-444444444444",
  plan: {
    version: 1,
    tenantId: "11111111-1111-4111-8111-111111111111",
    endpointId: "44444444-4444-4444-8444-444444444444",
    connectorInstanceId: "55555555-5555-4555-8555-555555555555",
    kind: "delivery",
    url: "https://connector.example/send",
    method: "POST",
    requestContentType: "application/json",
    timeoutMs: 1000,
    headers: { authorization: "secret-token" },
    maxPayloadBytes: 1024,
    retryPolicy: {
      maxAttempts: 1,
      initialDelayMs: 1,
      maxDelayMs: 1,
      multiplier: 2,
      retryStatuses: [500],
    },
    credentialRevision: 1,
    audience: "https://connector.example",
  },
  payload: { account: "safe" },
  payloadHash: sha256('{"account":"safe"}'),
  idempotencyKey: "a".repeat(64),
  status: "pending",
  attemptCount: 0,
};

describe("integration delivery evidence", () => {
  it("keeps hashes but omits raw response bodies and secrets", async () => {
    let evidence: DeliveryAttemptEvidence | undefined;
    const repository = {
      getDelivery: async () => delivery,
      beginAttempt: async () => ({
        ...delivery,
        status: "processing" as const,
        attemptCount: 1,
      }),
      appendAttempt: async (value: DeliveryAttemptEvidence) => {
        evidence = value;
      },
      markDelivered: async () => undefined,
      moveToDlq: async () => undefined,
      scheduleRetry: async () => undefined,
    } as unknown as IntegrationRepository;
    const handler = createIntegrationDeliveryHandler(
      repository,
      {
        invoke: async () => ({
          status: 500,
          headers: { authorization: "provider-secret" },
          body: new TextEncoder().encode("raw-secret-response"),
        }),
        probe: async () => {
          throw new Error("unused");
        },
      },
      {
        resolve: async () => {
          throw new Error("unused");
        },
      },
      () => new Date("2026-08-11T00:00:00Z"),
    );
    await handler.handle(
      {
        id: "job",
        name: "integration.deliver",
        data: { tenantId: delivery.tenantId, deliveryId: delivery.id },
      } as never,
      {
        signal: new AbortController().signal,
        attempt: 1,
        reportProgress: async () => undefined,
      },
    );
    expect(evidence?.responseBodyHash).toBe(
      sha256(new TextEncoder().encode("raw-secret-response")),
    );
    expect(JSON.stringify(evidence)).not.toContain("raw-secret-response");
    expect(evidence?.requestHeaders).toEqual({ authorization: "[REDACTED]" });
    expect(evidence?.responseHeaders).toEqual({ authorization: "[REDACTED]" });
  });
  it("does not write the legacy preview column", async () => {
    const source = await readFile(
      new URL("../kysely-integration-repository.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("response_body_preview");
  });
});

it("records credential resolution failures and retries replay jobs using their own attempt budget", async () => {
  const evidence: DeliveryAttemptEvidence[] = [];
  let nextAttempt: string | undefined;
  const repository = {
    getDelivery: async () => delivery,
    beginAttempt: async () => ({
      ...delivery,
      plan: {
        ...delivery.plan,
        credentialReference: "secret",
        retryPolicy: { ...delivery.plan.retryPolicy, maxAttempts: 3 },
      },
      status: "processing" as const,
      attemptCount: 8,
    }),
    appendAttempt: async (value: DeliveryAttemptEvidence) => {
      evidence.push(value);
    },
    scheduleRetry: async (_tenant: string, _id: string, next: string) => {
      nextAttempt = next;
    },
    moveToDlq: async () => {
      throw Error("Replay exhausted too early");
    },
  } as unknown as IntegrationRepository;
  const handler = createIntegrationDeliveryHandler(
    repository,
    {
      invoke: async () => {
        throw Error("Should not invoke");
      },
      probe: async () => {
        throw Error("unused");
      },
    },
    {
      resolve: async () => {
        throw Object.assign(Error("Unavailable"), {
          code: "SECRET_UNAVAILABLE",
          retryable: true,
        });
      },
    },
    () => new Date("2026-08-11T00:00:00Z"),
  );
  await expect(
    handler.handle(
      {
        id: "replay",
        name: "integration.deliver",
        data: { tenantId: delivery.tenantId, deliveryId: delivery.id },
      } as never,
      {
        signal: new AbortController().signal,
        attempt: 1,
        reportProgress: async () => undefined,
      },
    ),
  ).rejects.toMatchObject({ code: "SECRET_UNAVAILABLE", retryable: true });
  expect(evidence[0]).toMatchObject({
    attempt: 8,
    errorCode: "SECRET_UNAVAILABLE",
  });
  expect(nextAttempt).toBe("2026-08-11T00:00:00.001Z");
});
