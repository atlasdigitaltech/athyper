import { describe, expect, it, vi } from "vitest";
import type { PublicationDestinationHealth, PublicationOperationsRepository, PublicationSigningKeyRegistry } from "@athyper/server-contract-publication";
import { assessPublicationCanary, PublicationOperationsService, PublicationSigningRotationService } from "../publication-operations.js";

const deadLetter = { deliveryId: "delivery-1", deploymentId: "deployment-1", targetPlane: "neon" as const, targetInstance: "neon-primary", status: "dead_letter" as const, attempts: 5, failureCode: "TIMEOUT", failedAt: "2026-08-12T00:00:00.000Z", artifactHash: "a".repeat(64) };

describe("publication operational controls", () => {
  it("replays a DLQ delivery only after destination-health gating and records evidence", async () => {
    const enqueue = vi.fn(async () => "job-id");
    const recordReplayRequested = vi.fn(async () => undefined);
    const audit = vi.fn(async input => ({ ...input, id: "audit-1", occurredAt: "2026-08-12T01:00:00.000Z", severity: input.severity ?? "info" }));
    const service = new PublicationOperationsService({ repository: repository({ recordReplayRequested }), jobs: { enqueue }, audit: { record: audit }, now: () => "2026-08-12T01:00:00.000Z" });
    const result = await service.replay({ deliveryId: "delivery-1", actorId: "operator-1", tenantId: "tenant-1", requestId: "request-1", reason: "Destination recovered" });
    expect(result).toEqual({ deploymentId: "deployment-2", replayJobId: "job-id" });
    expect(enqueue).toHaveBeenCalledWith("publication.apply", "publication.apply-release", { deploymentId: "deployment-2", targetPlane: "neon" }, expect.objectContaining({ enqueueKey: "publication:deployment-2:replay:request-1" }));
    expect(recordReplayRequested).toHaveBeenCalledWith(expect.objectContaining({ deliveryId: "delivery-1", reason: "Destination recovered" }));
    expect(recordReplayRequested).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1" }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ eventCode: "publication.delivery.replay_requested", metadata: expect.objectContaining({ artifactHash: "a".repeat(64) }) }));
  });

  it("fails closed when destination health is unavailable", async () => {
    const service = new PublicationOperationsService({ repository: repository({ health: health("unavailable") }), jobs: { enqueue: vi.fn() }, audit: { async record(input) { return { ...input, id: "audit-1", occurredAt: "2026-08-12T01:00:00.000Z", severity: input.severity ?? "info" }; } } });
    await expect(service.replay({ deliveryId: "delivery-1", actorId: "operator-1", tenantId: "tenant-1", requestId: "request-1", reason: "retry" })).rejects.toMatchObject({ code: "PUBLICATION_DESTINATION_UNHEALTHY" });
  });

  it("rotates signing keys with an overlap window", async () => {
    const stage = vi.fn(async input => ({ keyId: input.keyId, status: "staged" as const, activatesAt: input.activatesAt }));
    const activate = vi.fn(async () => undefined);
    const registry: PublicationSigningKeyRegistry = { async list() { return [{ keyId: "key-old", status: "active", activatesAt: "2026-01-01T00:00:00.000Z" }]; }, stage, activate };
    const result = await new PublicationSigningRotationService(registry, () => new Date("2026-08-12T00:00:00.000Z")).rotate({ newKeyId: "key-new", activatesAt: "2026-08-12T01:00:00.000Z", overlapSeconds: 3600 });
    expect(result).toMatchObject({ previousKeyId: "key-old", previousKeyRetiresAt: "2026-08-12T02:00:00.000Z" });
    expect(activate).toHaveBeenCalledWith({ keyId: "key-new", previousKeyId: "key-old", previousKeyRetiresAt: "2026-08-12T02:00:00.000Z" });
  });

  it("promotes, holds or rolls back canaries from destination health", () => {
    expect(assessPublicationCanary([health("healthy"), health("healthy")], { minimumSamples: 2, rollbackFailureRate: 0.5 }).decision).toBe("promote");
    expect(assessPublicationCanary([health("healthy"), health("degraded")], { minimumSamples: 2, rollbackFailureRate: 0.5 }).decision).toBe("hold");
    expect(assessPublicationCanary([health("healthy"), health("unavailable")], { minimumSamples: 2, rollbackFailureRate: 0.5 }).decision).toBe("rollback");
  });
});

function health(status: PublicationDestinationHealth["status"]): PublicationDestinationHealth { return { targetPlane: "neon", targetInstance: "neon-primary", status, checkedAt: "2026-08-12T00:30:00.000Z", consecutiveFailures: status === "healthy" ? 0 : 1 }; }
function repository(overrides: Partial<PublicationOperationsRepository> & { health?: PublicationDestinationHealth } = {}): PublicationOperationsRepository { return { async getDeadLetter() { return deadLetter; }, async listDeadLetters() { return { items: [deadLetter] }; }, async getDestinationHealth() { return overrides.health ?? health("healthy"); }, async createReplayDeployment() { return { deploymentId:"deployment-2",targetPlane:"neon" }; }, async recordReplayRequested(input) { await overrides.recordReplayRequested?.(input); }, async getArtifactProvenance() { return null; }, ...overrides }; }
