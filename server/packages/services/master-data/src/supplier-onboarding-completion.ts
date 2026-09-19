import { sql, type Transaction } from "kysely";
import { createHash } from "node:crypto";
import { KyselyBusinessPartnerEligibilityRepository } from "./kysely-business-partner-eligibility-repository.js";
import { MasterDataError } from "./errors.js";
type Tx = Transaction<Record<string, never>>;
export type SupplierCompletionGate = {
  code: string;
  status: "satisfied" | "pending" | "blocked" | "not_applicable";
  owner: string;
  action: string | null;
  evidence: unknown;
};
export async function resolveSupplierActivationPolicy(
  tenantId: string,
  organizationId: string,
  companyId: string | null,
  tx: Tx,
) {
  const rows = (
    await sql<{
      id: string;
      version: number;
      operation_code: "purchasing" | "payment";
      rationale: string;
    }>`SELECT id,version,operation_code,rationale FROM control.supplier_activation_policy WHERE tenant_id=${tenantId}::uuid AND operating_organization_id=${organizationId}::uuid AND company_code_id IS NOT DISTINCT FROM ${companyId}::uuid AND effective_from<=now() AND (effective_until IS NULL OR effective_until>now())`.execute(
      tx,
    )
  ).rows;
  if (rows.length !== 1)
    throw new MasterDataError(
      409,
      "SUPPLIER_ACTIVATION_POLICY_UNAVAILABLE",
      "Exactly one current scoped supplier activation policy is required",
    );
  return rows[0]!;
}
export async function evaluateSupplierOnboardingCompletion(
  tenantId: string,
  runId: string,
  tx: Tx,
) {
  const base = (
    await sql<{
      result: {
        ready: boolean;
        evaluatedAt: string;
        reasons: string[];
        evidence: Record<string, unknown>;
      };
    }>`SELECT governance.evaluate_cycle_completion(${tenantId}::uuid,${runId}::uuid) result`.execute(
      tx,
    )
  ).rows[0]!.result;
  const row = (
    await sql<{
      case_id: string;
      attempt_id: string;
      status: string;
      target_entity_id: string | null;
      result_snapshot_id: string | null;
      decision_snapshot_id: string | null;
      evidence: any;
      row_version: string;
    }>`SELECT c.id case_id,a.id attempt_id,c.status,c.target_entity_id,c.result_snapshot_id,c.decision_snapshot_id,c.row_version,e.evidence FROM governance.process_attempt a JOIN document.entity_case c ON c.tenant_id=a.tenant_id AND c.id=a.case_id JOIN governance.process_selection_evidence e ON e.tenant_id=a.tenant_id AND e.id=a.selection_id WHERE a.tenant_id=${tenantId}::uuid AND a.cycle_run_id=${runId}::uuid ORDER BY a.attempt_number DESC LIMIT 1`.execute(
      tx,
    )
  ).rows[0];
  if (!row) return base;
  const gates: SupplierCompletionGate[] = [];
  const gate = (
    code: string,
    ok: boolean,
    owner: string,
    action: string | null,
    evidence: unknown = null,
    na = false,
  ) =>
    gates.push({
      code,
      status: na ? "not_applicable" : ok ? "satisfied" : "pending",
      owner,
      action: ok || na ? null : action,
      evidence,
    });
  gate(
    "process_work",
    base.ready,
    "governance",
    "resolve_process_work",
    base.evidence,
  );
  const scope = row.evidence.coordinate.scope;
  const pin =
    (
      await sql`SELECT 1 FROM governance.cycle_run WHERE tenant_id=${tenantId}::uuid AND id=${runId}::uuid AND template_revision_id=${row.evidence.executionManifest.cycle.id}::uuid AND template_hash=${row.evidence.executionManifest.cycle.hash}`.execute(
        tx,
      )
    ).rows.length === 1;
  gate("selection", pin, "process_selection", null, row.evidence.coordinate);
  gate(
    "approval",
    ["approved", "materializing", "materialized"].includes(row.status),
    "case",
    "complete_reviews",
    row.decision_snapshot_id,
  );
  const materialization = (
    await sql`SELECT id FROM document.entity_case_materialization WHERE tenant_id=${tenantId}::uuid AND entity_case_id=${row.case_id}::uuid AND status='succeeded' AND source_snapshot_id=${row.decision_snapshot_id}::uuid AND result_snapshot_id=${row.result_snapshot_id}::uuid`.execute(
      tx,
    )
  ).rows;
  const materialized =
    materialization.length === 1 &&
    row.status === "materialized" &&
    !!row.target_entity_id &&
    !!row.result_snapshot_id;
  gate(
    "materialization",
    materialized,
    "case",
    "materialize",
    row.result_snapshot_id,
  );
  const docs = (
    await sql<{
      purpose: string;
      status: string;
      id: string;
      source_id: string;
      activation_id: string;
      activation_hash: string;
    }>`SELECT id,purpose,status,intent->'sourceSnapshot'->>'id' source_id,intent->'activationEvidence'->>'id' activation_id,intent->'activationEvidence'->>'hash' activation_hash FROM governance.process_document_job WHERE tenant_id=${tenantId}::uuid AND attempt_id=${row.attempt_id}::uuid`.execute(
      tx,
    )
  ).rows;
  gate(
    "decision_document",
    docs.some(
      (d) =>
        d.purpose === "decision_document" &&
        d.status === "ready" &&
        d.source_id === row.decision_snapshot_id,
    ),
    "documents",
    "generate_decision_document",
    docs.filter((d) => d.purpose === "decision_document"),
  );
  let policy:
    Awaited<ReturnType<typeof resolveSupplierActivationPolicy>> | undefined;
  try {
    policy = await resolveSupplierActivationPolicy(
      tenantId,
      scope.operatingOrganizationId,
      scope.companyCodeId,
      tx,
    );
  } catch (e) {
    if (!(e instanceof MasterDataError)) throw e;
  }
  gate(
    "activation_policy",
    !!policy,
    "policy",
    "publish_activation_policy",
    policy ?? null,
  );
  const raw =
    materialized && policy
      ? await new KyselyBusinessPartnerEligibilityRepository().resolve(
          {
            tenantId,
            businessPartnerId: row.target_entity_id!,
            role: "supplier",
            operatingOrganizationId: scope.operatingOrganizationId,
            ...(scope.companyCodeId
              ? { companyCodeId: scope.companyCodeId }
              : {}),
            operationCode: policy.operation_code,
            businessDate: new Date().toISOString().slice(0, 10),
          },
          tx,
        )
      : null;
  for (const [code, owner, action, prefixes] of [
    [
      "organization_company",
      "company_setup",
      "configure_company",
      ["PARTNER_", "ORG_", "COMPANY_"],
    ],
    [
      "qualification",
      "supplier_qualification",
      "qualify_supplier",
      ["QUALIFICATION_"],
    ],
    ["commercial_setup", "company_setup", "configure_company", ["PAYMENT_"]],
    ["bank_verification", "banking", "register_and_verify_bank", ["BANK_"]],
    ["risk_blocks", "risk", "resolve_risk_or_blocks", ["RISK_", "BLOCKED_"]],
  ] as const) {
    const reasons = raw?.reasons.filter((r) =>
      prefixes.some((p) => r.code.startsWith(p)),
    );
    gate(
      code,
      !!raw && !reasons?.some((r) => r.severity === "blocking"),
      owner,
      action,
      {
        reasons: reasons ?? [],
        qualifications:
          code === "qualification" ? raw?.qualifications : undefined,
      },
      ["bank_verification", "commercial_setup"].includes(code) &&
        policy?.operation_code === "purchasing",
    );
    if (
      raw &&
      reasons?.some((r) => r.severity === "blocking") &&
      gates[gates.length - 1]!.status !== "not_applicable"
    )
      gates[gates.length - 1]!.status = "blocked";
  }
  const activation = materialized
    ? (
        await sql<{
          id: string;
          readiness_fingerprint: string;
          record_version: string;
          status: string;
        }>`SELECT a.id,a.readiness_fingerprint,s.record_version,s.status FROM document.supplier_activation_evidence a JOIN master.supplier s ON s.tenant_id=a.tenant_id AND s.id=a.supplier_id WHERE a.tenant_id=${tenantId}::uuid AND a.business_partner_id=${row.target_entity_id}::uuid AND a.operating_organization_id=${scope.operatingOrganizationId}::uuid AND a.company_code_id IS NOT DISTINCT FROM ${scope.companyCodeId}::uuid ORDER BY a.activated_at DESC LIMIT 1`.execute(
          tx,
        )
      ).rows[0]
    : undefined;
  gate(
    "activation",
    activation?.status === "active",
    "supplier_lifecycle",
    "create_activation_case",
    activation ?? null,
  );
  gate(
    "activation_confirmation",
    docs.some(
      (d) =>
        d.purpose === "activation_confirmation" &&
        d.status === "ready" &&
        d.source_id === row.result_snapshot_id &&
        d.activation_id === activation?.id &&
        d.activation_hash === activation?.readiness_fingerprint,
    ),
    "documents",
    "generate_activation_confirmation",
    docs.filter((d) => d.purpose === "activation_confirmation"),
  );
  const work = (
    await sql`SELECT s.entity_case_id,c.operation_code,c.status FROM governance.cycle_subject s JOIN document.entity_case c ON c.tenant_id=s.tenant_id AND c.id=s.entity_case_id WHERE s.tenant_id=${tenantId}::uuid AND s.cycle_run_id=${runId}::uuid AND NOT s.is_primary AND s.subject_role IN('company_setup','bank_change','supplier_activation') AND c.status NOT IN('materialized','rejected','cancelled')`.execute(
      tx,
    )
  ).rows;
  gate("linked_work", work.length === 0, "case", "complete_linked_cases", work);
  const supplier = materialized
    ? (
        await sql<{
          record_version: string;
        }>`SELECT record_version FROM master.supplier WHERE tenant_id=${tenantId}::uuid AND business_partner_id=${row.target_entity_id}::uuid`.execute(
          tx,
        )
      ).rows[0]
    : undefined;
  const activationReasons = raw?.reasons.filter(
    (reason) => reason.code !== "ROLE_INACTIVE",
  );
  const activationDecision = raw
    ? {
        ...raw,
        eligible: !activationReasons!.some(
          (reason) => reason.severity === "blocking",
        ),
        reasons: activationReasons!,
      }
    : undefined;
  const activationProposal =
    activationDecision && policy && supplier
      ? {
          businessDate: new Date().toISOString().slice(0, 10),
          expectedSupplierVersion: Number(supplier.record_version),
          policyId: policy.id,
          policyVersion: policy.version,
          readinessFingerprint: createHash("sha256")
            .update(JSON.stringify({ tenantId, ...activationDecision }))
            .digest("hex"),
          eligible: activationDecision.eligible,
        }
      : null;
  const reasons = gates
    .filter((g) => g.status !== "satisfied" && g.status !== "not_applicable")
    .map((g) => g.code);
  return {
    ready: reasons.length === 0,
    evaluatedAt: new Date().toISOString(),
    reasons,
    evidence: {
      ...base.evidence,
      caseId: row.case_id,
      caseVersion: Number(row.row_version),
      businessPartnerId: row.target_entity_id,
      scope,
      policy,
      gates,
      readiness: raw,
      activationProposal,
      activation,
      documents: docs,
      fingerprint: createHash("sha256")
        .update(JSON.stringify({ gates, policy, raw }))
        .digest("hex"),
    },
  };
}
