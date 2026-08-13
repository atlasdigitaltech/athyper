import { randomUUID } from "node:crypto";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  AuditEventFilter,
  AuditEventPage,
  AuditExportJobDispatcher,
  AuditExportRequest,
  AuditFieldClassificationReader,
  AuditGovernanceStore,
  AuditHashAnchor,
  AuditIntegrityEvidence,
  LegalHold,
  PiiInventoryEntry,
  RetentionPolicy,
} from "@athyper/server-contract-audit";
import {createAuditIntegrityVerifier} from "./audit-integrity.js";

export class AuditGovernanceError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = "AuditGovernanceError"; }
}

export interface AuditGovernanceServiceOptions {
  readonly authorizer: Authorizer;
  readonly store: AuditGovernanceStore;
  readonly exportJobs: AuditExportJobDispatcher;
  readonly classifications: AuditFieldClassificationReader;
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly maxQueryRangeDays?: number;
  readonly exportRetentionDays?: number;
}

export function createAuditGovernanceService(options: AuditGovernanceServiceOptions) {
  const now = () => options.now?.() ?? new Date();
  const id = () => options.createId?.() ?? randomUUID();
  return {
    async query(context: VerifiedRequestContext, filter: AuditEventFilter, limit = 100, cursor?: string): Promise<AuditEventPage> {
      validateFilter(filter, options.maxQueryRangeDays ?? 90);
      if (!Number.isInteger(limit) || limit < 1 || limit > 250) throw new AuditGovernanceError(400, "AUDIT_LIMIT_INVALID", "Audit query limit must be between 1 and 250");
      await permit(options.authorizer, context, "audit.event.query", { filter });
      return options.store.query(context.tenantId, filter, limit, cursor);
    },
    async entityTimeline(context: VerifiedRequestContext, entityType: string, entityId: string, occurredFrom: string, occurredUntil: string, limit = 100, cursor?: string) {
      return this.query(context, { entityType, entityId, occurredFrom, occurredUntil }, limit, cursor);
    },
    async securityDecisions(context: VerifiedRequestContext, filter: AuditEventFilter, limit = 100, cursor?: string) {
      validateFilter(filter, options.maxQueryRangeDays ?? 90);
      await permit(options.authorizer, context, "audit.security_decision.query", { filter });
      return options.store.query(context.tenantId, { ...filter, eventCodes: filter.eventCodes ?? ["iam.authorization.decided", "iam.authentication.succeeded", "iam.authentication.failed"] }, Math.min(Math.max(limit, 1), 250), cursor);
    },
    async requestExport(context: VerifiedRequestContext, filter: AuditEventFilter, format: AuditExportRequest["format"]): Promise<AuditExportRequest> {
      validateFilter(filter, 3_650);
      await permit(options.authorizer, context, "audit.export.create", { exactFilter: filter, format });
      const requestedAt = now();
      const request: AuditExportRequest = Object.freeze({ id: id(), tenantId: context.tenantId, actorPrincipalId: context.principalId, exactFilter: structuredClone(filter), format, status: "queued", requestedAt: requestedAt.toISOString(), retentionUntil: new Date(requestedAt.getTime() + (options.exportRetentionDays ?? 7) * 86_400_000).toISOString() });
      await options.store.createExport(request);
      await options.exportJobs.enqueue(request.id);
      return request;
    },
    async downloadUrl(context: VerifiedRequestContext, exportRequestId: string, createUrl: (objectKey: string, ttlSeconds: number) => Promise<string>) {
      await permit(options.authorizer, context, "audit.export.download", { exportRequestId });
      const request = await options.store.getExport(context.tenantId, exportRequestId);
      const manifest = request ? await options.store.getManifest(exportRequestId) : null;
      if (!request || !manifest || request.status !== "completed") throw new AuditGovernanceError(404, "AUDIT_EXPORT_NOT_READY", "Audit export is not available");
      if (new Date(request.retentionUntil) <= now()) throw new AuditGovernanceError(410, "AUDIT_EXPORT_EXPIRED", "Audit export has expired");
      return { url: await createUrl(manifest.objectKey, 300), expiresInSeconds: 300, manifest };
    },
    async verifyIntegrity(context: VerifiedRequestContext, filter: AuditEventFilter): Promise<AuditIntegrityEvidence> {
      validateFilter(filter, 3_650);
      await permit(options.authorizer, context, "audit.integrity.verify", { filter });
      const precedingAnchor = await options.store.findAnchor(context.tenantId, filter.occurredFrom);
      const verifier=createAuditIntegrityVerifier(precedingAnchor ? { precedingHash: precedingAnchor.hash } : {});
      for await (const batch of options.store.stream(context.tenantId, filter, 500)) for (const event of batch) verifier.append(event);
      const diagnostic=verifier.finish(),calculatedHash=diagnostic.chainHead??diagnostic.snapshotHash,eventCount=diagnostic.eventCount;
      const anchor = await options.store.findAnchor(context.tenantId, filter.occurredUntil);
      const evidence: AuditIntegrityEvidence = Object.freeze({ id: id(), tenantId: context.tenantId, checkedFrom: filter.occurredFrom, checkedUntil: filter.occurredUntil, eventCount, valid: diagnostic.valid&&(!anchor || anchor.hash === calculatedHash), verificationStatus: diagnostic.verificationStatus, integrityIssues: diagnostic.issues.map(issue=>issue.code), calculatedHash, ...(anchor ? { anchorHash: anchor.hash } : {}), createdAt: now().toISOString(), actorPrincipalId: context.principalId });
      await options.store.appendIntegrityEvidence(evidence);
      return evidence;
    },
    async createHashAnchor(context: VerifiedRequestContext, filter: AuditEventFilter): Promise<AuditHashAnchor> {
      await permit(options.authorizer, context, "audit.integrity.anchor", { filter });
      const evidence = await this.verifyIntegrity(context, filter);
      if (!evidence.valid || evidence.verificationStatus !== "verified") throw new AuditGovernanceError(409, "AUDIT_INTEGRITY_NOT_VERIFIED", "Only fully verified chained evidence can be anchored");
      const anchor: AuditHashAnchor = Object.freeze({ tenantId: context.tenantId, periodEnd: filter.occurredUntil, hash: evidence.calculatedHash, createdAt: now().toISOString() });
      await options.store.appendAnchor(anchor); return anchor;
    },
    async createLegalHold(context: VerifiedRequestContext, matterCode: string, filter: AuditEventFilter): Promise<LegalHold> {
      validateFilter(filter, 36_500); await permit(options.authorizer, context, "audit.legal_hold.admin", { matterCode, filter });
      const hold: LegalHold = Object.freeze({ id: id(), tenantId: context.tenantId, matterCode, filter: structuredClone(filter), status: "active", createdAt: now().toISOString() });
      await options.store.createLegalHold(hold); return hold;
    },
    async releaseLegalHold(context: VerifiedRequestContext, holdId: string): Promise<void> { await permit(options.authorizer, context, "audit.legal_hold.admin", { holdId }); if (!await options.store.releaseLegalHold(context.tenantId, holdId, now().toISOString())) throw new AuditGovernanceError(404, "LEGAL_HOLD_NOT_FOUND", "Legal hold was not found"); },
    async canPurge(context: VerifiedRequestContext, filter: AuditEventFilter, expiredByNormalPolicy: boolean): Promise<boolean> { await permit(options.authorizer, context, "audit.retention.execute", { filter }); return expiredByNormalPolicy && !await options.store.hasActiveLegalHold(context.tenantId, filter); },
    async piiInventory(context: VerifiedRequestContext): Promise<readonly PiiInventoryEntry[]> { await permit(options.authorizer, context, "audit.pii_inventory.query", {}); return options.classifications.listPiiFields(context); },
    async listRetentionPolicies(context: VerifiedRequestContext): Promise<readonly RetentionPolicy[]> { await permit(options.authorizer, context, "audit.retention.admin", {}); return options.store.listRetentionPolicies(context.tenantId); },
    async saveRetentionPolicy(context: VerifiedRequestContext, policy: RetentionPolicy): Promise<void> { if (!Number.isInteger(policy.retainDays) || policy.retainDays < 1) throw new AuditGovernanceError(400, "RETENTION_INVALID", "Retention days must be positive"); await permit(options.authorizer, context, "audit.retention.admin", { policy }); await options.store.saveRetentionPolicy(context.tenantId, Object.freeze({ ...policy })); },
  };
}

function validateFilter(filter: AuditEventFilter, maxDays: number): void { const from = new Date(filter.occurredFrom); const until = new Date(filter.occurredUntil); if (!Number.isFinite(from.getTime()) || !Number.isFinite(until.getTime()) || until <= from) throw new AuditGovernanceError(400, "AUDIT_FILTER_RANGE_INVALID", "Audit filter requires a valid increasing time range"); if (until.getTime() - from.getTime() > maxDays * 86_400_000) throw new AuditGovernanceError(400, "AUDIT_FILTER_RANGE_TOO_LARGE", `Audit filter range exceeds ${maxDays} days`); if ((filter.eventCodes?.length ?? 0) > 50 || (filter.actorPrincipalIds?.length ?? 0) > 50) throw new AuditGovernanceError(400, "AUDIT_FILTER_TOO_BROAD", "Audit filter contains too many values"); }
async function permit(authorizer: Authorizer, context: VerifiedRequestContext, permissionCode: string, resource: Readonly<Record<string, unknown>>): Promise<void> { if (!(await authorizer.authorize({ context, permissionCode, resource })).allowed) throw new AuditGovernanceError(403, "FORBIDDEN", `Permission denied: ${permissionCode}`); }
