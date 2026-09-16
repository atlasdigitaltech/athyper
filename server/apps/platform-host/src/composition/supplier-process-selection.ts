import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import {
  businessPartnerRequestPermissions,
  type BusinessPartnerRequestRepository,
} from "@athyper/server-contract-master-data";
import type { ProcessSelectionPublication } from "@athyper/server-contract-control-admin";
import type {
  ProcessSelectionEvidence,
  ProcessSelectionFacts,
} from "@athyper/server-contract-governance";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import {
  createProcessSelectionCatalog,
  createKyselyProcessSelectionPublicationRepository,
} from "@athyper/server-platform-control-admin";
import {
  createPolicyService,
  createKyselyPolicyRepository,
} from "@athyper/server-platform-policy";
import {
  createProcessSelectionService,
  createKyselyProcessSelectionEvidenceRepository,
  ProcessSelectionError,
  registerProcessSelectionPreviewRoutes,
} from "@athyper/server-platform-governance";
import { HttpError } from "@athyper/server-runtime-http";
import { readSupplierProcessWorkflow } from "./supplier-process-workflow.js";
import { sql, type Transaction } from "kysely";
import type { Application, RequestHandler, Response } from "express";
type Tx = Transaction<Record<string, never>>;
type SupplierSelectionOptions = {
  authorizer: Authorizer;
  repository: BusinessPartnerRequestRepository<Tx>;
  transactions: PlaneTransactionCoordinator<Tx>;
  audit: AuditRecorder<Tx>;
  authenticate: RequestHandler;
  readContext: (response: Response) => VerifiedRequestContext;
};
export function createSupplierProcessSelectionService(
  options: SupplierSelectionOptions,
) {
  const catalog = createProcessSelectionCatalog({
    planeKey: "neon",
    workflow: async (revision, scope, tx) =>
      !!(await readSupplierProcessWorkflow(revision, scope, tx)),
  });
  const publications = createKyselyProcessSelectionPublicationRepository();
  const service = createProcessSelectionService({
    facts: async (
      context,
      caseId,
      mode,
      tx,
    ): Promise<ProcessSelectionFacts> => {
      if (context.planeKey !== "neon")
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Supplier process preview is available in NEON.",
        );
      const request = await options.repository.get(
        context.tenantId,
        caseId,
        tx,
      );
      if (!request)
        throw new HttpError(
          404,
          "BUSINESS_PARTNER_REQUEST_NOT_FOUND",
          "Business Partner request was not found.",
        );
      const resource = {
        tenantId: context.tenantId,
        entityCode: "entity_case",
        resourceCode: "entity_case",
        recordId: caseId,
        requestId: caseId,
        authorizationTarget: "existing",
        ...(mode === "select" ? { makerCheckerEnforced: true } : {}),
        operatingOrganizationId: request.operatingOrganizationId,
        ...(request.companyCodeId
          ? { companyCodeId: request.companyCodeId }
          : {}),
      };
      const access = await options.authorizer.authorize({
        context,
        permissionCode:
          mode === "preview"
            ? businessPartnerRequestPermissions.read
            : businessPartnerRequestPermissions.submit,
        resource,
        observation: {
          entityCode: "business_partner",
          surface: "command",
          phase: mode === "preview" ? "discover" : "execute",
        },
      });
      if (!access.allowed)
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Permission denied for this case.",
        );
      if (
        request.kind !== "new_partner" ||
        request.source.kind !== "manual" ||
        request.requestedRole !== "supplier"
      )
        throw new ProcessSelectionError("PROCESS_PREVIEW_NOT_APPLICABLE");
      if (!request.operatingOrganizationId)
        throw new ProcessSelectionError("PROCESS_SCOPE_INCOMPLETE");
      const scope = {
        tenantId: context.tenantId,
        planeKey: "neon" as const,
        processFamily: "supplier_onboarding",
        operatingOrganizationId: request.operatingOrganizationId,
        companyCodeId: request.companyCodeId ?? null,
      };
      const snapshot = (
        await sql<{
          id: string;
          version_number: number;
          payload_hash: string;
        }>`SELECT i.id,i.version_number,i.payload_hash FROM snapshot.entity_snapshot_identity i JOIN document.entity_case c ON c.tenant_id=i.tenant_id AND c.current_snapshot_id=i.id WHERE c.tenant_id=${context.tenantId}::uuid AND c.id=${caseId}::uuid AND c.row_version=${request.rowVersion}`.execute(
          tx,
        )
      ).rows[0];
      if (!snapshot)
        throw new ProcessSelectionError("PROCESS_SNAPSHOT_UNAVAILABLE");
      const asOf = new Date().toISOString();
      return {
        scope,
        caseId,
        snapshot: {
          id: snapshot.id,
          version: snapshot.version_number,
          hash: snapshot.payload_hash,
        },
        requestedRequirement: request.proposedPayload
          .requestedComplianceLevel as ProcessSelectionFacts["requestedRequirement"],
        reason: (request.proposedPayload.complianceRequirementReason ??
          null) as string | null,
        authorityAsOf: asOf,
        minimumControls: await catalog.minimumControls(scope, asOf, tx),
      };
    },
    publications: publications.resolve,
    pinned: async (context, caseId, tx) => {
      const previous = (
        await sql<{
          evidence: ProcessSelectionEvidence;
        }>`SELECT e.evidence FROM governance.process_attempt a JOIN governance.process_selection_evidence e ON e.tenant_id=a.tenant_id AND e.id=a.selection_id WHERE a.tenant_id=${context.tenantId}::uuid AND a.case_id=${caseId}::uuid ORDER BY a.attempt_number LIMIT 1`.execute(
          tx,
        )
      ).rows[0];
      if (!previous) return undefined;
      // Corrections must resolve the exact accepted task release, never the current head or its base catalog.
      const p = previous.evidence.policy;
      const rows = (
        await sql<{
          publication: ProcessSelectionPublication;
        }>`WITH base AS (
            SELECT id,publication FROM control.process_selection_publication
            WHERE tenant_id=${context.tenantId}::uuid AND policy_definition_id=${p.id}::uuid
              AND policy_version=${p.version} AND policy_hash=${p.hash}
              AND publication->'scope'=${JSON.stringify(previous.evidence.coordinate.scope)}::jsonb
          ), candidates AS (
            SELECT publication FROM base
            UNION ALL
            SELECT r.publication FROM control.process_task_rule_release r JOIN base b ON b.id=r.base_publication_id
            WHERE r.tenant_id=${context.tenantId}::uuid
          )
          SELECT publication FROM candidates
          WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(publication->'manifests') m
            WHERE m=${JSON.stringify(previous.evidence.executionManifest)}::jsonb)`.execute(
          tx,
        )
      ).rows;
      if (rows.length !== 1)
        throw new ProcessSelectionError(
          "PROCESS_PINNED_PUBLICATION_UNAVAILABLE",
        );
      return { publication: rows[0]!.publication, evidence: previous.evidence };
    },
    compiler: catalog.compiler,
    policy: createPolicyService({
      repository: createKyselyPolicyRepository(),
      transactions: options.transactions,
      audit: options.audit,
    }),
    evidence: createKyselyProcessSelectionEvidenceRepository(),
  });
  return service;
}
export function mountSupplierProcessSelectionPreview(
  app: Application,
  options: SupplierSelectionOptions,
  service = createSupplierProcessSelectionService(options),
) {
  registerProcessSelectionPreviewRoutes(app, {
    authenticate: options.authenticate,
    readContext: options.readContext,
    transactions: options.transactions,
    service,
  });
}
