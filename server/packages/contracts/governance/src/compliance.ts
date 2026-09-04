import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export const compliancePermissions = {
  legalHoldManage: "governance.legal_hold.manage",
  reportPackGenerate: "governance.report_pack.generate",
} as const;

export type LegalHoldStatus = "draft" | "active" | "released" | "cancelled";
export type LegalHoldResourceKind =
  | "partition"
  | "table_record"
  | "document"
  | "snapshot"
  | "compiled_artifact"
  | "storage_object"
  | "backup_object"
  | "audit_export";

export interface LegalHoldResource {
  readonly id: string;
  readonly kind: LegalHoldResourceKind;
  readonly schema?: string;
  readonly entity?: string;
  readonly resourceId?: string;
  readonly uri?: string;
  readonly contentHash?: string;
  readonly capturedAt: string;
  readonly releasedAt?: string;
}

export interface LegalHold {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly description?: string;
  readonly legalAuthority?: string;
  readonly issuedAt?: string;
  readonly effectiveAt?: string;
  readonly releasedAt?: string;
  readonly ownerPrincipalId?: string;
  readonly status: LegalHoldStatus;
  readonly resources: readonly LegalHoldResource[];
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface LegalHoldRepository {
  createDraft(input: Omit<LegalHold, "resources">): Promise<LegalHold>;
  get(tenantId: string, holdId: string): Promise<LegalHold | undefined>;
  addResource(
    tenantId: string,
    holdId: string,
    resource: LegalHoldResource,
    principalId: string,
  ): Promise<LegalHoldResource>;
  removeDraftResource(
    tenantId: string,
    holdId: string,
    resourceId: string,
  ): Promise<boolean>;
  activate(
    tenantId: string,
    holdId: string,
    principalId: string,
    effectiveAt: string,
  ): Promise<LegalHold | undefined>;
  release(
    tenantId: string,
    holdId: string,
    principalId: string,
    releasedAt: string,
  ): Promise<LegalHold | undefined>;
}

/** Bridges governance holds to resource-specific purge/retention implementations. */
export interface LegalHoldRetentionAdapter {
  /** Implementations must be idempotent because activation/release can be retried after partial failure. */
  apply(input: {
    readonly context: VerifiedRequestContext;
    readonly hold: LegalHold;
    readonly resource: LegalHoldResource;
    readonly effectiveAt: string;
  }): Promise<void>;
  release(input: {
    readonly context: VerifiedRequestContext;
    readonly hold: LegalHold;
    readonly resource: LegalHoldResource;
    readonly releasedAt: string;
  }): Promise<void>;
}

export interface LegalHoldService {
  createDraft(command: {
    readonly context: VerifiedRequestContext;
    readonly code: string;
    readonly name: string;
    readonly description?: string;
    readonly legalAuthority?: string;
    readonly issuedAt?: string;
    readonly ownerPrincipalId?: string;
  }): Promise<LegalHold>;
  addResource(command: {
    readonly context: VerifiedRequestContext;
    readonly holdId: string;
    readonly resource: Omit<
      LegalHoldResource,
      "id" | "capturedAt" | "releasedAt"
    >;
  }): Promise<LegalHoldResource>;
  removeResource(
    context: VerifiedRequestContext,
    holdId: string,
    resourceId: string,
  ): Promise<void>;
  activate(
    context: VerifiedRequestContext,
    holdId: string,
    effectiveAt?: string,
  ): Promise<LegalHold>;
  release(
    context: VerifiedRequestContext,
    holdId: string,
    releasedAt?: string,
  ): Promise<LegalHold>;
  get(context: VerifiedRequestContext, holdId: string): Promise<LegalHold>;
}

export type ReportPackStatus =
  "draft" | "generating" | "ready" | "failed" | "superseded";
export interface PinnedSourceRevision {
  readonly entityCode: string;
  readonly entityId: string;
  readonly revision: string;
  readonly contentHash?: string;
}
export interface ReportPack {
  readonly id: string;
  readonly tenantId: string;
  readonly reportTypeCode: string;
  readonly code: string;
  readonly name: string;
  readonly source?: PinnedSourceRevision;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly artifactUri?: string;
  readonly artifactHash?: string;
  readonly generatedAt?: string;
  readonly expiresAt?: string;
  readonly supersedesReportPackId?: string;
  readonly jobId: string;
  readonly status: ReportPackStatus;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface ReportSourceRevisionResolver {
  pin(
    context: VerifiedRequestContext,
    source: { readonly entityCode: string; readonly entityId: string },
  ): Promise<PinnedSourceRevision>;
}
export interface ReportPackRepository {
  createGenerating(pack: ReportPack): Promise<ReportPack>;
  get(tenantId: string, reportPackId: string): Promise<ReportPack | undefined>;
  complete(
    tenantId: string,
    reportPackId: string,
    input: {
      readonly artifactUri: string;
      readonly artifactHash: string;
      readonly generatedAt: string;
      readonly expiresAt?: string;
      readonly evidence: Readonly<Record<string, unknown>>;
    },
  ): Promise<ReportPack>;
  appendEvidence(
    tenantId: string,
    reportPackId: string,
    evidence: Readonly<Record<string, unknown>>,
  ): Promise<void>;
  fail(
    tenantId: string,
    reportPackId: string,
    evidence: Readonly<Record<string, unknown>>,
  ): Promise<void>;
  /** Finds durable generation rows whose enqueue/worker hand-off may have been lost. */
  listRecoverable(
    before: string,
    limit: number,
  ): Promise<readonly ReportPack[]>;
}
export interface ReportPackArtifactGenerator {
  generate(pack: ReportPack): Promise<{
    readonly body: Uint8Array | string;
    readonly contentType: string;
    readonly evidence?: Readonly<Record<string, unknown>>;
  }>;
}
export interface ReportPackService {
  request(command: {
    readonly context: VerifiedRequestContext;
    readonly reportTypeCode: string;
    readonly code: string;
    readonly name: string;
    readonly source?: {
      readonly entityCode: string;
      readonly entityId: string;
    };
    readonly parameters?: Readonly<Record<string, unknown>>;
    readonly supersedesReportPackId?: string;
  }): Promise<ReportPack>;
  get(
    context: VerifiedRequestContext,
    reportPackId: string,
  ): Promise<ReportPack>;
  download(
    context: VerifiedRequestContext,
    reportPackId: string,
  ): Promise<{
    readonly url: string;
    readonly expiresInSeconds: number;
    readonly sha256: string;
  }>;
}
