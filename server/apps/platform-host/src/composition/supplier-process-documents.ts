import { randomUUID } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type {
  DocumentService,
  RenderDocumentCommand,
  TrustedDocumentProjection,
} from "@athyper/server-contract-documents";
import type {
  ProcessDocumentIntent,
  ProcessDocumentGateResult,
  ProcessSelectionEvidence,
} from "@athyper/server-contract-governance";
import type { ProcessDocumentPurpose } from "@athyper/server-contract-control-admin";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import {
  createKyselyProcessDocumentIntentPort,
  processSelectionCanonical,
} from "@athyper/server-platform-governance";
import { processCatalogContentHash } from "@athyper/server-platform-control-admin";
import { HttpError } from "@athyper/server-runtime-http";
type Tx = Transaction<Record<string, never>>;
type Job = {
  id: string;
  tenant_id: string;
  case_id: string;
  intent: ProcessDocumentIntent;
  intent_hash: string;
  status: string;
  result: ProcessDocumentGateResult | null;
  gate_status: string;
  created_by: string;
  attempt_count: number;
  last_error: string | null;
};
type Case = {
  id: string;
  status: string;
  created_by: string;
  submitted_snapshot_id: string;
  decision_snapshot_id: string | null;
  result_snapshot_id: string | null;
  target_entity_id: string | null;
  evidence: ProcessSelectionEvidence;
};
const purposes: readonly ProcessDocumentPurpose[] = [
  "submitted_review_pack",
  "decision_document",
  "activation_confirmation",
];
function fail(code: string, status = 409): never {
  throw new HttpError(status, code, code);
}
const safe = (v: unknown) =>
  typeof v === "string"
    ? v.replace(/[\x00-\x08\x0b-\x1f]/g, "").slice(0, 2000)
    : "";
export function createSupplierProcessDocuments(options: {
  authorizer: Authorizer;
  transactions: PlaneTransactionCoordinator<Tx>;
  documents: DocumentService;
  reviewReady(
    context: VerifiedRequestContext,
    caseId: string,
    tx: Tx,
  ): Promise<unknown>;
}) {
  const run = <T>(c: VerifiedRequestContext, work: (tx: Tx) => Promise<T>) =>
    options.transactions.run(
      "neon",
      { tenantId: c.tenantId, principalId: c.principalId },
      work,
    );
  async function readCase(c: VerifiedRequestContext, id: string, tx: Tx) {
    if (c.planeKey !== "neon") fail("PROCESS_DOCUMENT_PLANE_INVALID", 403);
    const row =
      (
        await sql<Case>`SELECT c.id,c.status,c.created_by,c.submitted_snapshot_id,c.decision_snapshot_id,c.result_snapshot_id,c.target_entity_id,e.evidence FROM document.entity_case c JOIN governance.process_attempt a ON a.tenant_id=c.tenant_id AND a.case_id=c.id JOIN governance.process_selection_evidence e ON e.tenant_id=a.tenant_id AND e.id=a.selection_id WHERE c.tenant_id=${c.tenantId}::uuid AND c.id=${id}::uuid ORDER BY a.attempt_number DESC LIMIT 1`.execute(
          tx,
        )
      ).rows[0] ?? fail("PROCESS_DOCUMENT_CASE_NOT_FOUND", 404);
    const scope = row.evidence.coordinate.scope;
    if (
      !(
        await options.authorizer.authorize({
          context: c,
          permissionCode: "neon.relationship.entity_case.read",
          resource: {
            tenantId: c.tenantId,
            entityCode: "entity_case",
            resourceCode: "entity_case",
            recordId: id,
            authorizationTarget: "existing",
            operatingOrganizationId: scope.operatingOrganizationId,
            ...(scope.companyCodeId
              ? { companyCodeId: scope.companyCodeId }
              : {}),
          },
        })
      ).allowed
    )
      fail("PROCESS_DOCUMENT_FORBIDDEN", 403);
    return row;
  }
  async function renderAuthority(c: VerifiedRequestContext, id: string) {
    await run(c, async (tx) => {
      const row = await readCase(c, id, tx),
        scope = row.evidence.coordinate.scope;
      if (
        !(
          await options.authorizer.authorize({
            context: c,
            permissionCode: "neon.relationship.entity_case.submit",
            resource: {
              tenantId: c.tenantId,
              entityCode: "entity_case",
              resourceCode: "entity_case",
              recordId: id,
              authorizationTarget: "existing",
              operatingOrganizationId: scope.operatingOrganizationId,
              ...(scope.companyCodeId
                ? { companyCodeId: scope.companyCodeId }
                : {}),
              makerCheckerEnforced: true,
            },
          })
        ).allowed
      )
        fail("PROCESS_DOCUMENT_RENDER_FORBIDDEN", 403);
    });
  }

  async function getJob(c: VerifiedRequestContext, id: string, tx: Tx) {
    return (
      (
        await sql<Job>`SELECT * FROM governance.process_document_job WHERE tenant_id=${c.tenantId}::uuid AND id=${id}::uuid`.execute(
          tx,
        )
      ).rows[0] ?? fail("PROCESS_DOCUMENT_NOT_FOUND", 404)
    );
  }
  async function activation(
    row: Case,
    tx: Tx,
    pin?: ProcessDocumentIntent["activationEvidence"],
  ) {
    const scope = row.evidence.coordinate.scope;
    return (
      await sql<{
        supplier_id: string;
        id: string;
        activated_at: Date;
        readiness_fingerprint: string;
      }>`SELECT e.id,e.supplier_id,e.activated_at,e.readiness_fingerprint FROM document.supplier_activation_evidence e JOIN master.supplier s ON s.tenant_id=e.tenant_id AND s.id=e.supplier_id AND s.status='active' WHERE (${pin?.id ?? null}::uuid IS NULL OR e.id=${pin?.id ?? null}::uuid) AND (${pin?.hash ?? null}::text IS NULL OR e.readiness_fingerprint=${pin?.hash ?? null}) AND e.tenant_id=${scope.tenantId}::uuid AND e.business_partner_id=${row.target_entity_id}::uuid AND e.operating_organization_id=${scope.operatingOrganizationId}::uuid AND e.company_code_id IS NOT DISTINCT FROM ${scope.companyCodeId}::uuid ORDER BY e.activated_at DESC,e.id DESC LIMIT 1`.execute(
        tx,
      )
    ).rows[0];
  }
  async function source(row: Case, purpose: ProcessDocumentPurpose, tx: Tx) {
    if (
      row.status === "cancelled" ||
      (purpose === "submitted_review_pack" && row.status === "draft")
    )
      fail("PROCESS_DOCUMENT_ATTEMPT_CLOSED");
    const id =
      purpose === "submitted_review_pack"
        ? row.submitted_snapshot_id
        : purpose === "decision_document"
          ? row.decision_snapshot_id
          : row.result_snapshot_id;
    if (
      !id ||
      (purpose === "activation_confirmation" && !(await activation(row, tx)))
    )
      fail("PROCESS_DOCUMENT_SOURCE_NOT_READY");
    return (
      (
        await sql<{
          id: string;
          version_number: number;
          payload_hash: string;
        }>`SELECT id,version_number,payload_hash FROM snapshot.entity_snapshot_identity WHERE tenant_id=${row.evidence.coordinate.scope.tenantId}::uuid AND id=${id}::uuid`.execute(
          tx,
        )
      ).rows[0] ?? fail("PROCESS_DOCUMENT_SNAPSHOT_MISSING")
    );
  }
  async function command(
    c: VerifiedRequestContext,
    id: string,
    action: string,
    token: string | null,
    result: unknown,
    tx: Tx,
  ) {
    return (
      await sql<{
        job: Job;
      }>`SELECT document.command_process_document_job(${c.tenantId}::uuid,${id}::uuid,${action},${token}::uuid,${JSON.stringify(result)}::jsonb,${c.principalId}::uuid) job`.execute(
        tx,
      )
    ).rows[0]!.job;
  }
  async function acceptResult(
    c: VerifiedRequestContext,
    result: ProcessDocumentGateResult,
    token: string,
    tx: Tx,
  ) {
    const job = await getJob(c, result.jobId, tx),
      row = await readCase(c, job.case_id, tx);
    if (
      processSelectionCanonical(result.coordinate) !==
      processSelectionCanonical(row.evidence.coordinate)
    )
      return "stale" as const;
    const current = await source(row, result.purpose, tx);
    if (
      current.id !== result.sourceSnapshot.id ||
      current.payload_hash !== result.sourceSnapshot.hash
    )
      return "stale" as const;
    const replay =
      job.status === "ready" &&
      processSelectionCanonical(job.result) ===
        processSelectionCanonical(result);
    await command(c, job.id, result.status, token, result, tx);
    return replay ? ("replayed" as const) : ("accepted" as const);
  }
  async function gate(c: VerifiedRequestContext, job: Job) {
    if (job.status !== "ready" || job.gate_status === "succeeded") return;
    try {
      await run(c, async (tx) => {
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${c.tenantId}:entity-case:${job.case_id}`},0))`.execute(
          tx,
        );
        const row = await readCase(c, job.case_id, tx),
          current = await source(row, job.intent.binding.purpose, tx);
        if (
          row.evidence.coordinate.attemptId !==
            job.intent.coordinate.attemptId ||
          current.id !== job.intent.sourceSnapshot.id
        )
          fail("PROCESS_DOCUMENT_STALE_GATE");
        if (
          job.intent.binding.purpose === "submitted_review_pack" &&
          ["submitted", "in_review"].includes(row.status)
        )
          await options.reviewReady(c, job.case_id, tx);
        // Decision and activation documents release only their declarative DB gate; materialization/closure retain their owners.
        await command(c, job.id, "gate_succeeded", null, {}, tx);
      });
    } catch (error) {
      await run(c, (tx) =>
        command(
          c,
          job.id,
          "gate_failed",
          null,
          {
            code:
              typeof (error as { code?: unknown }).code === "string"
                ? String((error as { code: string }).code)
                : "PROCESS_DOCUMENT_GATE_FAILED",
          },
          tx,
        ),
      );
    }
  }
  return {
    async authorizeArtifact(
      c: VerifiedRequestContext,
      attachmentId: string,
      tx: Tx,
    ) {
      const artifact = (
        await sql<{
          job_id: string | null;
        }>`SELECT metadata->'process_document'->>'jobId' job_id FROM document.attachment WHERE tenant_id=${c.tenantId}::uuid AND id=${attachmentId}::uuid`.execute(
          tx,
        )
      ).rows[0];
      if (!artifact?.job_id) return;
      const job = await getJob(c, artifact.job_id, tx);
      const row = await readCase(c, job.case_id, tx);
      const pin = job.intent.binding.recipientPolicy;
      const policy = (
        await sql<{
          definition: Record<string, unknown>;
          content_hash: string;
        }>`SELECT definition,content_hash FROM control.process_selection_catalog_revision WHERE tenant_id=${c.tenantId}::uuid AND id=${pin.id}::uuid AND version=${pin.version} AND content_hash=${pin.hash} AND kind='recipient_policy'`.execute(
          tx,
        )
      ).rows[0];
      if (
        !policy ||
        processCatalogContentHash(policy.definition) !== policy.content_hash ||
        policy.definition["purpose"] !== job.intent.binding.purpose ||
        policy.definition["publicLinks"] !== false
      )
        fail("PROCESS_DOCUMENT_RECIPIENT_POLICY_INVALID", 403);
      if (job.intent.binding.purpose === "submitted_review_pack") {
        const scope = job.intent.coordinate.scope;
        const eligible = (
          await sql`SELECT i.id FROM document.work_item i WHERE i.tenant_id=${c.tenantId}::uuid AND i.payload->>'attemptId'=${job.intent.coordinate.attemptId} AND i.assignee_principal_id=${c.principalId}::uuid AND i.assignee_principal_id IN(SELECT principal_id FROM document.process_case_reviewers(${c.tenantId}::uuid,${row.id}::uuid,NULL)) LIMIT 1`.execute(
            tx,
          )
        ).rows.length;
        if (!eligible) fail("PROCESS_DOCUMENT_RECIPIENT_FORBIDDEN", 403);
      } else if (row.created_by !== c.principalId) {
        const scope = job.intent.coordinate.scope;
        const access = await options.authorizer.authorize({
          context: c,
          permissionCode: "neon.relationship.entity_case.submit",
          resource: {
            tenantId: c.tenantId,
            entityCode: "entity_case",
            resourceCode: "entity_case",
            recordId: row.id,
            operatingOrganizationId: scope.operatingOrganizationId,
            ...(scope.companyCodeId
              ? { companyCodeId: scope.companyCodeId }
              : {}),
            makerCheckerEnforced: true,
          },
        });
        if (!access.allowed) fail("PROCESS_DOCUMENT_RECIPIENT_FORBIDDEN", 403);
      }
      if (
        job.status !== "ready" ||
        job.result?.status !== "ready" ||
        job.result.attachmentVersionId !== attachmentId
      )
        fail("PROCESS_DOCUMENT_ARTIFACT_NOT_RELEASED", 403);
      return true;
    },
    async request(
      c: VerifiedRequestContext,
      caseId: string,
      purpose: ProcessDocumentPurpose,
    ) {
      if (!purposes.includes(purpose))
        fail("PROCESS_DOCUMENT_PURPOSE_INVALID", 400);
      await renderAuthority(c, caseId);
      return run(c, async (tx) => {
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${c.tenantId}:entity-case:${caseId}`},0))`.execute(
          tx,
        );
        const row = await readCase(c, caseId, tx),
          snapshot = await source(row, purpose, tx),
          binding =
            row.evidence.executionManifest.documents.find(
              (d) => d.purpose === purpose,
            ) ?? fail("PROCESS_DOCUMENT_BINDING_MISSING");
        const existing = (
          await sql<{
            id: string;
            intent: ProcessDocumentIntent;
          }>`SELECT id,intent FROM governance.process_document_job WHERE tenant_id=${c.tenantId}::uuid AND attempt_id=${row.evidence.coordinate.attemptId}::uuid AND purpose=${purpose}`.execute(
            tx,
          )
        ).rows[0];
        if (existing) {
          if (
            existing.intent.sourceSnapshot.id !== snapshot.id ||
            existing.intent.sourceSnapshot.hash !== snapshot.payload_hash
          )
            fail("PROCESS_DOCUMENT_SOURCE_CONFLICT");
          return { jobId: existing.id, replayed: true };
        }
        const activated =
          purpose === "activation_confirmation"
            ? await activation(row, tx)
            : undefined;
        return createKyselyProcessDocumentIntentPort().enqueue(
          c,
          {
            ...(activated
              ? {
                  activationEvidence: {
                    id: activated.id,
                    version: 1,
                    hash: activated.readiness_fingerprint,
                  },
                }
              : {}),
            coordinate: row.evidence.coordinate,
            binding,
            sourceSnapshot: {
              id: snapshot.id,
              version: snapshot.version_number,
              hash: snapshot.payload_hash,
            },
            idempotencyKey: `process-document:${row.evidence.coordinate.attemptId}:${purpose}`,
            requestedBy: c.principalId,
          },
          tx,
        );
      });
    },
    async project(
      commandInput: RenderDocumentCommand,
      tx: Tx,
    ): Promise<TrustedDocumentProjection> {
      const c = commandInput.context,
        job = await getJob(
          c,
          commandInput.trustedJobId ?? fail("PROCESS_DOCUMENT_JOB_REQUIRED"),
          tx,
        ),
        row = await readCase(c, job.case_id, tx),
        intent = job.intent;
      if (
        commandInput.entityType !== "entity_case" ||
        commandInput.entityId !== row.id ||
        commandInput.operationCode !== intent.binding.purpose ||
        (job.status !== "processing" && job.status !== "ready")
      )
        fail("PROCESS_DOCUMENT_RENDER_BINDING_INVALID");
      if (
        processSelectionCanonical(intent.coordinate) !==
        processSelectionCanonical(row.evidence.coordinate)
      )
        fail("PROCESS_DOCUMENT_ATTEMPT_STALE");
      const snapshot = await source(row, intent.binding.purpose, tx);
      if (
        snapshot.id !== intent.sourceSnapshot.id ||
        snapshot.version_number !== intent.sourceSnapshot.version ||
        snapshot.payload_hash !== intent.sourceSnapshot.hash
      )
        fail("PROCESS_DOCUMENT_SOURCE_STALE");
      const projection = (
        await sql<{
          definition: Record<string, unknown>;
          content_hash: string;
        }>`SELECT definition,content_hash FROM control.process_selection_catalog_revision WHERE tenant_id=${c.tenantId}::uuid AND id=${intent.binding.projection.id}::uuid AND version=${intent.binding.projection.version} AND kind='projection' AND content_hash=${intent.binding.projection.hash}`.execute(
          tx,
        )
      ).rows[0];
      if (
        !projection ||
        processCatalogContentHash(projection.definition) !==
          projection.content_hash ||
        projection.definition["owner"] !== "business_partner" ||
        projection.definition["omitCredentials"] !== true ||
        projection.definition["requireExactSnapshot"] !== true ||
        projection.definition["source"] !== intent.binding.source
      )
        fail("PROCESS_DOCUMENT_PROJECTION_UNSAFE");
      const data: Record<string, string> = {
        caseId: row.id,
        attemptNumber: String(intent.coordinate.attemptNumber),
        profile: row.evidence.effectiveProfile.code,
        snapshotId: snapshot.id,
        snapshotHash: snapshot.payload_hash,
      };
      if (intent.binding.purpose === "submitted_review_pack") {
        const payload =
          (
            await sql<{
              name: unknown;
              requirement: unknown;
              reason: unknown;
            }>`SELECT payload_json->>'name' name,payload_json->>'requestedComplianceLevel' requirement,payload_json->>'complianceRequirementReason' reason FROM snapshot.entity_snapshot WHERE tenant_id=${c.tenantId}::uuid AND snapshot_id=${snapshot.id}::uuid`.execute(
              tx,
            )
          ).rows[0] ?? fail("PROCESS_DOCUMENT_PAYLOAD_MISSING");
        Object.assign(data, {
          organizationName: safe(payload.name),
          requestedRequirement: safe(payload.requirement),
          requirementReason: safe(payload.reason),
          evidenceReferences:
            "Validated submitted snapshot. Restricted attachment contents are omitted; access supporting evidence through the authorized case view.",
        });
      } else if (intent.binding.purpose === "decision_document") {
        const decision =
          (
            await sql<{
              after_status: string;
              recorded_at: Date;
              id: string;
            }>`SELECT id,after_status,recorded_at FROM document.entity_case_command_evidence WHERE tenant_id=${c.tenantId}::uuid AND entity_case_id=${row.id}::uuid AND result_snapshot_id=${snapshot.id}::uuid AND command_code='entity.case.decision' ORDER BY recorded_at DESC LIMIT 1`.execute(
              tx,
            )
          ).rows[0] ?? fail("PROCESS_DOCUMENT_DECISION_MISSING");
        const workflows = (
          await sql<{
            id: string;
            status: string;
          }>`SELECT id,status FROM document.workflow_request WHERE tenant_id=${c.tenantId}::uuid AND entity_type='cycle_task' AND metadata->'process'->>'attemptId'=${intent.coordinate.attemptId} ORDER BY id`.execute(
            tx,
          )
        ).rows;
        Object.assign(data, {
          decision: decision.after_status,
          decisionAt: new Date(decision.recorded_at).toISOString(),
          decisionEvidence: `Command evidence ${decision.id}; task outcomes ${workflows.map((w) => `${w.id}: ${w.status}`).join(", ")}`,
        });
      } else {
        const activated =
          (await activation(row, tx, intent.activationEvidence)) ??
          fail("PROCESS_DOCUMENT_ACTIVATION_MISSING");
        Object.assign(data, {
          supplierId: activated.supplier_id,
          activationAt: new Date(activated.activated_at).toISOString(),
          readinessEvidence: `Activation evidence ${activated.id}; readiness fingerprint ${activated.readiness_fingerprint}`,
        });
      }
      if (
        processSelectionCanonical(Object.keys(data).sort()) !==
        processSelectionCanonical(
          (projection.definition["fields"] as string[]).slice().sort(),
        )
      )
        fail("PROCESS_DOCUMENT_PROJECTION_FIELDS_MISMATCH");
      return {
        data,
        exactTemplate: intent.binding.template,
        provenance: {
          schema: "athyper.process-document-provenance/1",
          jobId: job.id,
          intentHash: job.intent_hash,
          ...(intent.activationEvidence
            ? { activationEvidence: intent.activationEvidence }
            : {}),
          coordinate: intent.coordinate,
          purpose: intent.binding.purpose,
          sourceSnapshot: intent.sourceSnapshot,
          projection: intent.binding.projection,
          template: intent.binding.template,
          profile: row.evidence.effectiveProfile,
          policy: row.evidence.policy,
        },
      };
    },
    async process(c: VerifiedRequestContext, id: string) {
      const initial = await run(c, async (tx) => {
        const j = await getJob(c, id, tx);
        await readCase(c, j.case_id, tx);
        return j;
      });
      await renderAuthority(c, initial.case_id);
      const token = randomUUID();
      let job = await run(c, (tx) => command(c, id, "claim", token, {}, tx));
      if (job.status !== "ready") {
        try {
          const document = await options.documents.render({
            context: c,
            entityType: "entity_case",
            entityId: job.case_id,
            operationCode: job.intent.binding.purpose,
            trustedJobId: id,
            data: {},
            idempotencyKey: `process-document:${id}`,
            fileName: `supplier-${job.intent.binding.purpose}-${job.case_id}.pdf`,
          });
          const scan = await run(
            c,
            async (tx) =>
              (
                await sql<{
                  scan: Record<string, unknown>;
                }>`SELECT metadata->'malware_scan' scan FROM document.attachment WHERE tenant_id=${c.tenantId}::uuid AND id=${document.id}::uuid`.execute(
                  tx,
                )
              ).rows[0]?.scan ?? fail("PROCESS_DOCUMENT_SCAN_PROOF_MISSING"),
          );
          const result: ProcessDocumentGateResult = {
            coordinate: job.intent.coordinate,
            purpose: job.intent.binding.purpose,
            jobId: id,
            sourceSnapshot: job.intent.sourceSnapshot,
            template: job.intent.binding.template,
            idempotencyKey: `process-document-result:${id}`,
            status: "ready",
            attachmentId: document.id,
            attachmentVersionId: document.id,
            sha256: document.sha256,
            scanStatus: "clean",
            scannedAt: String(scan["scanned_at"]),
          };
          const accepted = await run(c, (tx) =>
            acceptResult(c, result, token, tx),
          );
          if (accepted === "stale") fail("PROCESS_DOCUMENT_STALE_RESULT");
        } catch (error) {
          const code =
            typeof (error as { code?: unknown }).code === "string"
              ? String((error as { code: string }).code)
              : "PROCESS_DOCUMENT_PROVIDER_FAILED";
          const result: ProcessDocumentGateResult = {
            coordinate: job.intent.coordinate,
            purpose: job.intent.binding.purpose,
            jobId: id,
            sourceSnapshot: job.intent.sourceSnapshot,
            template: job.intent.binding.template,
            idempotencyKey: `process-document-result:${id}`,
            status: "failed",
            code,
            retryable: !/MALWARE_DETECTED|UNSAFE|STALE|FORBIDDEN|CONFLICT/.test(
              code,
            ),
          };
          await run(c, (tx) => command(c, id, "failed", token, result, tx));
        }
        job = await run(c, (tx) => getJob(c, id, tx));
      }
      await gate(c, job);
      return run(c, async (tx) => {
        const final = await getJob(c, id, tx);
        return {
          jobId: id,
          status: final.status,
          gateStatus: final.gate_status,
          errorCode: final.last_error,
          result: final.result,
        };
      });
    },
    async retry(c: VerifiedRequestContext, id: string) {
      return run(c, async (tx) => {
        const j = await getJob(c, id, tx);
        await readCase(c, j.case_id, tx);
        await renderAuthority(c, j.case_id);
        await command(c, id, "retry", null, {}, tx);
        return { jobId: id, status: "pending" };
      });
    },
    async view(c: VerifiedRequestContext, caseId: string) {
      return run(c, async (tx) => {
        const row = await readCase(c, caseId, tx);
        let canRender = false;
        try {
          await renderAuthority(c, caseId);
          canRender = true;
        } catch (error) {
          if (!(error instanceof HttpError && error.statusCode === 403))
            throw error;
        }
        const jobs = (
          await sql<
            Job & { purpose: string; attempt_id: string }
          >`SELECT * FROM governance.process_document_job WHERE tenant_id=${c.tenantId}::uuid AND case_id=${caseId}::uuid ORDER BY created_at,id`.execute(
            tx,
          )
        ).rows;
        return Promise.all(
          jobs.map(async (job) => {
            let canDownload = false;
            if (job.status === "ready" && job.result?.status === "ready") {
              try {
                canDownload =
                  (await this.authorizeArtifact(
                    c,
                    job.result.attachmentVersionId,
                    tx,
                  )) === true;
              } catch (error) {
                if (!(error instanceof HttpError && error.statusCode === 403))
                  throw error;
              }
            }
            return {
              id: job.id,
              purpose: job.purpose,
              attempt_id: job.attempt_id,
              status: job.status,
              gate_status: job.gate_status,
              attempt_count: job.attempt_count,
              source_snapshot: job.intent.sourceSnapshot,
              template: job.intent.binding.template,
              required_before: job.intent.binding.requiredBefore,
              result: job.result,
              canDownload,
              canRetry:
                canRender &&
                job.attempt_id === row.evidence.coordinate.attemptId &&
                job.status === "failed",
            };
          }),
        );
      });
    },
    async download(c: VerifiedRequestContext, id: string) {
      const j = await run(c, async (tx) => {
        const job = await getJob(c, id, tx);
        await readCase(c, job.case_id, tx);
        return job;
      });
      if (j.status !== "ready" || j.result?.status !== "ready")
        fail("PROCESS_DOCUMENT_NOT_READY");
      return options.documents.createDownload({
        context: c,
        documentId: j.result.attachmentVersionId,
      });
    },
  };
}
