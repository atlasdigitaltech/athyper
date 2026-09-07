import { createHash, randomUUID } from "node:crypto";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import { compliancePermissions, type ReportPack, type ReportPackArtifactGenerator, type ReportPackRepository, type ReportPackService, type ReportSourceRevisionResolver } from "@athyper/server-contract-governance";
import type { JobEnvelope, JobHandler, JobPublisher } from "@athyper/server-contract-jobs";
import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import type { ExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";

export const REPORT_PACK_QUEUE = "governance";
export const REPORT_PACK_JOB = "governance.report-pack.generate";
export const REPORT_PACK_RECOVERY_JOB = "governance.report-pack.recover";
export interface ReportPackJobPayload { readonly tenantId: string; readonly reportPackId: string; }
export interface ReportPackRecoveryPayload { readonly staleAfterMs?: number; readonly limit?: number; }

export function reportPackJobId(tenantId: string, reportPackId: string): string { return `report-pack-${createHash("sha256").update(`${tenantId}:${reportPackId}`).digest("hex")}`; }

export function createReportPackService(options: { readonly authorizer: Authorizer; readonly repositories: ExactPlaneRepositoryProvider<ReportPackRepository>; readonly revisions: ReportSourceRevisionResolver; readonly jobs: JobPublisher; readonly storage: ObjectStorage; readonly now?: () => Date; readonly createId?: () => string; readonly downloadTtlSeconds?: number }): ReportPackService {
  const now = () => options.now?.() ?? new Date();
  const load = async (context: VerifiedRequestContext, reportPackId: string) => { const pack = await options.repositories.require(context.planeKey).get(context.tenantId, reportPackId); if (!pack) throw coded("GOVERNANCE_NOT_FOUND"); return pack; };
  return {
    async request(command) {
      await permit(options.authorizer, command.context);
      const repository = options.repositories.require(command.context.planeKey);
      const id = options.createId?.() ?? randomUUID();
      const reportTypeCode = required(command.reportTypeCode, "reportTypeCode");
      const code = required(command.code, "code").toUpperCase();
      if (!/^[a-z][a-z0-9_.-]{1,62}$/u.test(reportTypeCode)) throw coded("GOVERNANCE_INVALID_COMMAND", { field: "reportTypeCode" });
      if (!/^[A-Z][A-Z0-9_.-]{1,62}$/u.test(code)) throw coded("GOVERNANCE_INVALID_COMMAND", { field: "code" });
      const source = command.source ? await options.revisions.pin(command.context, command.source) : undefined;
      if (command.supersedesReportPackId) { const previous = await load(command.context, command.supersedesReportPackId); if (previous.status !== "ready") throw coded("GOVERNANCE_INVALID_TRANSITION", { reason: "only_ready_report_packs_can_be_superseded" }); }
      const jobId = reportPackJobId(command.context.tenantId, id);
      const pack: ReportPack = { id, tenantId: command.context.tenantId, reportTypeCode, code, name: required(command.name, "name"), ...(source ? { source } : {}), parameters: structuredClone(command.parameters ?? {}), ...(command.supersedesReportPackId ? { supersedesReportPackId: command.supersedesReportPackId } : {}), jobId, status: "generating", evidence: { requestedAt: now().toISOString(), pinnedSourceRevision: source?.revision ?? null }, createdAt: now().toISOString(), createdBy: command.context.principalId };
      const created = await repository.createGenerating(pack);
      try { await options.jobs.enqueue(REPORT_PACK_QUEUE, REPORT_PACK_JOB, { tenantId: pack.tenantId, reportPackId: pack.id }, { jobId, maxAttempts: 5, backoff: { kind: "exponential", delayMs: 1_000 }, execution: { planeKey: command.context.planeKey, scope: "tenant", tenantId: pack.tenantId, principalId: command.context.principalId, ...(command.context.correlationId ? { correlationId: command.context.correlationId } : {}) }, payloadSchema: { name: REPORT_PACK_JOB, version: 1 }, removeOnComplete: false, removeOnFail: false }); }
      catch (error) { await repository.fail(pack.tenantId, pack.id, { code: "ENQUEUE_FAILED", message: message(error), failedAt: now().toISOString() }); throw error; }
      return created;
    },
    async get(context, reportPackId) { await permit(options.authorizer, context); return load(context, reportPackId); },
    async download(context, reportPackId) {
      await permit(options.authorizer, context);
      const pack = await load(context, reportPackId);
      if (pack.status !== "ready" || !pack.artifactUri || !pack.artifactHash) throw coded("GOVERNANCE_INVALID_TRANSITION", { reason: "report_pack_not_ready" });
      if (pack.expiresAt && new Date(pack.expiresAt) <= now()) throw coded("GOVERNANCE_REPORT_PACK_EXPIRED");
      const actual = createHash("sha256").update(await options.storage.get(pack.artifactUri)).digest("hex");
      if (actual !== pack.artifactHash) throw coded("GOVERNANCE_ARTIFACT_INTEGRITY_FAILED", { expected: pack.artifactHash, actual });
      const expiresInSeconds = Math.min(options.downloadTtlSeconds ?? 300, pack.expiresAt ? Math.floor((Date.parse(pack.expiresAt) - now().getTime()) / 1000) : Infinity);
      if (expiresInSeconds < 1) throw coded("GOVERNANCE_REPORT_PACK_EXPIRED");
      return { url: await options.storage.createDownloadUrl(pack.artifactUri, expiresInSeconds), expiresInSeconds, sha256: actual };
    },
  };
}

export function createReportPackJobHandler(options: { readonly repositories: ExactPlaneRepositoryProvider<ReportPackRepository>; readonly storage: ObjectStorage; readonly generator: ReportPackArtifactGenerator; readonly now?: () => Date; readonly retentionDays?: number }): JobHandler<typeof REPORT_PACK_JOB, ReportPackJobPayload> {
  return { async handle(job: JobEnvelope<typeof REPORT_PACK_JOB, ReportPackJobPayload>) {
    if (!job.execution?.planeKey) throw coded("GOVERNANCE_EXACT_PLANE_REQUIRED");
    const repository = options.repositories.require(job.execution.planeKey);
    const pack = await repository.get(job.data.tenantId, job.data.reportPackId);
    if (!pack) return { status: "discarded", reason: "report_pack_not_found" };
    if (pack.status === "ready") return { status: "completed", output: { reportPackId: pack.id, artifactHash: pack.artifactHash } };
    if (pack.status !== "generating") return { status: "discarded", reason: `report_pack_${pack.status}` };
    const objectKey = `governance/report-packs/${pack.tenantId}/${pack.id}`;
    try {
      const artifact = await options.generator.generate(pack);
      const bytes = typeof artifact.body === "string" ? Buffer.from(artifact.body, "utf8") : artifact.body;
      const artifactHash = createHash("sha256").update(bytes).digest("hex");
      if (!options.storage.putIfAbsent) throw coded("GOVERNANCE_IMMUTABLE_STORAGE_REQUIRED");
      const created = await options.storage.putIfAbsent(objectKey, bytes, { contentType: artifact.contentType, metadata: { sha256: artifactHash, reportPackId: pack.id } });
      if (!created) {
        const existingHash = createHash("sha256").update(await options.storage.get(objectKey)).digest("hex");
        if (existingHash !== artifactHash) throw coded("GOVERNANCE_ARTIFACT_INTEGRITY_FAILED", { expected: artifactHash, actual: existingHash });
      }
      const generatedAt = (options.now?.() ?? new Date()).toISOString();
      const expiresAt = options.retentionDays ? new Date(new Date(generatedAt).getTime() + options.retentionDays * 86_400_000).toISOString() : undefined;
      const completed = await repository.complete(pack.tenantId, pack.id, { artifactUri: objectKey, artifactHash, generatedAt, ...(expiresAt ? { expiresAt } : {}), evidence: { jobId: job.id, attempt: job.attempt, byteCount: bytes.byteLength, contentType: artifact.contentType, ...(artifact.evidence ?? {}) } });
      return { status: "completed", output: { reportPackId: completed.id, artifactUri: objectKey, artifactHash } };
    } catch (error) {
      const evidence = { jobId: job.id, attempt: job.attempt, code: "GENERATION_FAILED", message: message(error), failedAt: (options.now?.() ?? new Date()).toISOString() };
      if (job.attempt >= job.maxAttempts) await repository.fail(pack.tenantId, pack.id, evidence);
      else await repository.appendEvidence(pack.tenantId, pack.id, { [`attempt_${job.attempt}_failure`]: evidence });
      throw error;
    }
  } };
}

/** Re-publishes deterministic generation jobs for durable rows left in generating state. */
export function createReportPackRecoveryHandler(options: { readonly repositories: ExactPlaneRepositoryProvider<ReportPackRepository>; readonly jobs: JobPublisher; readonly now?: () => Date }): JobHandler<typeof REPORT_PACK_RECOVERY_JOB, ReportPackRecoveryPayload> {
  return { async handle(job) {
    const planeKey=job.execution?.planeKey;
    if(!planeKey)throw coded("GOVERNANCE_EXACT_PLANE_REQUIRED");
    const staleAfterMs=Math.max(60_000,job.data.staleAfterMs??300_000),limit=Math.min(500,Math.max(1,job.data.limit??100));
    const repository=options.repositories.require(planeKey),before=new Date((options.now?.()??new Date()).getTime()-staleAfterMs).toISOString();
    const packs=await repository.listRecoverable(before,limit);let enqueued=0,failed=0;
    for(const pack of packs){try{await options.jobs.enqueue(REPORT_PACK_QUEUE,REPORT_PACK_JOB,{tenantId:pack.tenantId,reportPackId:pack.id},{jobId:pack.jobId,maxAttempts:5,backoff:{kind:"exponential",delayMs:1_000},execution:{planeKey,scope:"tenant",tenantId:pack.tenantId,principalId:pack.createdBy},payloadSchema:{name:REPORT_PACK_JOB,version:1},removeOnComplete:false,removeOnFail:false});enqueued++;}catch(error){failed++;await repository.appendEvidence(pack.tenantId,pack.id,{recovery_enqueue_failure:{jobId:job.id,message:message(error),failedAt:(options.now?.()??new Date()).toISOString()}});}}
    return{status:"completed",output:{examined:packs.length,enqueued,failed}};
  }};
}

async function permit(authorizer: Authorizer, context: VerifiedRequestContext): Promise<void> { if (!(await authorizer.authorize({ context, permissionCode: compliancePermissions.reportPackGenerate })).allowed) throw coded("GOVERNANCE_PERMISSION_DENIED"); }
function required(value: string, field: string): string { const result = value.trim(); if (!result) throw coded("GOVERNANCE_INVALID_COMMAND", { field }); return result; }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function coded(code: string, details?: unknown): Error { return Object.assign(new Error(code), { code, details }); }
