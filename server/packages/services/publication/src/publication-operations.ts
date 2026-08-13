import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { JobPublisher } from "@athyper/server-contract-jobs";
import type {
  PublicationCanaryAssessment,
  PublicationDestinationHealth,
  PublicationOperationsRepository,
  PublicationPlane,
  PublicationSigningKeyRegistry,
  PublicationSigningKeyVersion,
} from "@athyper/server-contract-publication";
import { APPLY_PUBLICATION_RELEASE_JOB, PUBLICATION_APPLY_QUEUE } from "./publication-jobs.js";

export class PublicationOperationsError extends Error {
  constructor(readonly code: string, message = code) { super(message); this.name = "PublicationOperationsError"; }
}

export class PublicationOperationsService {
  constructor(private readonly options: { readonly repository: PublicationOperationsRepository; readonly jobs: JobPublisher; readonly audit: AuditRecorder; readonly now?: () => string }) {}

  listDeadLetters(input: { readonly tenantId: string; readonly plane?: PublicationPlane; readonly targetInstance?: string; readonly limit?: number; readonly cursor?: string }) {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    return this.options.repository.listDeadLetters({ tenantId: input.tenantId, ...(input.plane ? { plane: input.plane } : {}), ...(input.targetInstance ? { targetInstance: input.targetInstance } : {}), limit, ...(input.cursor ? { cursor: input.cursor } : {}) });
  }

  destinationHealth(tenantId: string, targetPlane: PublicationPlane, targetInstance: string) { return this.options.repository.getDestinationHealth(tenantId, targetPlane, targetInstance); }

  async replay(input: { readonly deliveryId: string; readonly actorId: string; readonly tenantId: string; readonly requestId: string; readonly reason: string; readonly forceUnhealthy?: boolean }): Promise<{ readonly deploymentId: string; readonly replayJobId: string }> {
    const reason = input.reason.trim();
    if (!reason) throw new PublicationOperationsError("PUBLICATION_REPLAY_REASON_REQUIRED");
    const delivery = await this.options.repository.getDeadLetter(input.tenantId, input.deliveryId);
    if (!delivery || (delivery.status !== "dead_letter" && delivery.status !== "failed")) throw new PublicationOperationsError("PUBLICATION_DELIVERY_NOT_REPLAYABLE");
    const health = await this.options.repository.getDestinationHealth(input.tenantId, delivery.targetPlane, delivery.targetInstance);
    if ((health.status === "unavailable" || health.status === "unknown") && input.forceUnhealthy !== true) throw new PublicationOperationsError("PUBLICATION_DESTINATION_UNHEALTHY");
    const requestedAt = this.options.now?.() ?? new Date().toISOString();
    const replay = await this.options.repository.createReplayDeployment({ tenantId: input.tenantId, deliveryId: delivery.deliveryId, replayCommandId: input.requestId, actorId: input.actorId, requestedAt });
    const replayJobId = `publication:${replay.deploymentId}:replay:${input.requestId}`;
    await this.options.jobs.enqueue(PUBLICATION_APPLY_QUEUE, APPLY_PUBLICATION_RELEASE_JOB, { deploymentId: replay.deploymentId, targetPlane: replay.targetPlane }, { jobId: replayJobId, maxAttempts: 5, payloadSchema: { name: APPLY_PUBLICATION_RELEASE_JOB, version: 1 }, execution: { planeKey: replay.targetPlane, scope: "tenant", tenantId: input.tenantId, principalId: input.actorId, correlationId: input.requestId } });
    await this.options.repository.recordReplayRequested({ tenantId: input.tenantId, deliveryId: delivery.deliveryId, replayDeploymentId: replay.deploymentId, replayJobId, actorId: input.actorId, reason, requestedAt });
    await this.options.audit.record({ eventCode: "publication.delivery.replay_requested", action: "replay", outcome: "success", severity: "critical", actor: { kind: "user", principalId: input.actorId }, tenantId: input.tenantId, entityType: "publication_delivery", entityId: delivery.deliveryId, requestId: input.requestId, correlationId: input.requestId, metadata: { deploymentId: delivery.deploymentId, replayJobId, reason, destinationHealth: health.status, forced: input.forceUnhealthy === true, artifactHash: delivery.artifactHash } });
    return { deploymentId: replay.deploymentId, replayJobId };
  }

  async provenance(tenantId: string, deploymentId: string) {
    const provenance = await this.options.repository.getArtifactProvenance(tenantId, deploymentId);
    if (!provenance) throw new PublicationOperationsError("PUBLICATION_PROVENANCE_NOT_FOUND");
    return provenance;
  }
}

export class PublicationSigningRotationService {
  constructor(private readonly registry: PublicationSigningKeyRegistry, private readonly now: () => Date = () => new Date()) {}

  async rotate(input: { readonly newKeyId: string; readonly activatesAt: string; readonly overlapSeconds: number }): Promise<{ readonly staged: PublicationSigningKeyVersion; readonly previousKeyId?: string; readonly previousKeyRetiresAt?: string }> {
    if (!input.newKeyId.trim()) throw new PublicationOperationsError("PUBLICATION_SIGNING_KEY_REQUIRED");
    if (!Number.isInteger(input.overlapSeconds) || input.overlapSeconds < 300) throw new PublicationOperationsError("PUBLICATION_SIGNING_OVERLAP_TOO_SHORT");
    const activation = new Date(input.activatesAt);
    if (Number.isNaN(activation.valueOf()) || activation.valueOf() < this.now().valueOf()) throw new PublicationOperationsError("PUBLICATION_SIGNING_ACTIVATION_INVALID");
    const keys = await this.registry.list();
    if (keys.some(key => key.keyId === input.newKeyId && key.status !== "retired")) throw new PublicationOperationsError("PUBLICATION_SIGNING_KEY_EXISTS");
    const previous = keys.find(key => key.status === "active");
    const previousKeyRetiresAt = previous ? new Date(activation.valueOf() + input.overlapSeconds * 1_000).toISOString() : undefined;
    const staged = await this.registry.stage({ keyId: input.newKeyId, activatesAt: activation.toISOString() });
    await this.registry.activate({ keyId: input.newKeyId, ...(previous ? { previousKeyId: previous.keyId, previousKeyRetiresAt } : {}) });
    return { staged, ...(previous ? { previousKeyId: previous.keyId, previousKeyRetiresAt } : {}) };
  }
}

export function assessPublicationCanary(health: readonly PublicationDestinationHealth[], options: { readonly minimumSamples: number; readonly rollbackFailureRate: number }): PublicationCanaryAssessment {
  const failed = health.filter(item => item.status === "unavailable").length;
  const healthy = health.filter(item => item.status === "healthy").length;
  const reasons: string[] = [];
  let decision: PublicationCanaryAssessment["decision"] = "promote";
  if (health.length < options.minimumSamples) { decision = "hold"; reasons.push("INSUFFICIENT_CANARY_SAMPLES"); }
  const failureRate = health.length === 0 ? 0 : failed / health.length;
  if (failureRate >= options.rollbackFailureRate && failed > 0) { decision = "rollback"; reasons.push("CANARY_FAILURE_RATE_EXCEEDED"); }
  else if (health.some(item => item.status === "degraded" || item.status === "unknown")) { decision = decision === "promote" ? "hold" : decision; reasons.push("CANARY_DESTINATION_NOT_HEALTHY"); }
  return { decision, sampledDestinations: health.length, healthyDestinations: healthy, failedDestinations: failed, reasons };
}
