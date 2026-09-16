import { createHash } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type { BusinessPartnerRequest } from "@athyper/server-contract-master-data";
import { KyselyBusinessPartnerEligibilityRepository } from "./kysely-business-partner-eligibility-repository.js";
import { resolveSupplierActivationPolicy } from "./supplier-onboarding-completion.js";
import { MasterDataError } from "./errors.js";

/** Evaluate the existing eligibility owner under the current published activation scope. */
export async function authorizeSupplierActivationReadiness(
  request: BusinessPartnerRequest,
  tx: Transaction<Record<string, never>>,
) {
  if (request.status === "applied") {
    const evidence = (
      await sql<{
        readiness_fingerprint: string;
      }>`SELECT a.readiness_fingerprint FROM document.supplier_activation_evidence a JOIN document.entity_case_materialization m ON m.tenant_id=a.tenant_id AND m.entity_case_id=${request.id}::uuid AND m.status='succeeded' AND EXISTS(SELECT 1 FROM document.entity_case c WHERE c.tenant_id=m.tenant_id AND c.id=m.entity_case_id AND c.result_snapshot_id=m.result_snapshot_id AND c.status='materialized') WHERE a.tenant_id=${request.tenantId}::uuid AND a.idempotency_key=${`activation-case:${request.id}`} AND a.business_partner_id=${request.targetBusinessPartnerId ?? null}::uuid`.execute(
        tx,
      )
    ).rows[0];
    if (!evidence)
      throw new MasterDataError(
        409,
        "SUPPLIER_ACTIVATION_REPLAY_INVALID",
        "Activation materialization evidence is unavailable",
      );
    return {
      readiness: {
        eligible: true,
        decisionFingerprint: evidence.readiness_fingerprint,
      },
      policy: undefined,
      expectedSupplierVersion: undefined,
    };
  }
  return prepareSupplierActivation(request, tx);
}

export async function prepareSupplierActivation(
  request: BusinessPartnerRequest,
  tx: Transaction<Record<string, never>>,
) {
  const businessDate = new Date().toISOString().slice(0, 10);
  const activation = request.proposedPayload["activation"] as
    Record<string, unknown> | undefined;
  if (
    !request.targetBusinessPartnerId ||
    !request.operatingOrganizationId ||
    !activation ||
    activation["businessDate"] !== businessDate
  )
    throw new MasterDataError(
      409,
      "SUPPLIER_ACTIVATION_CASE_SCOPE_INVALID",
      "Activation requires a target, organization and today's business date",
    );
  const supplier = (
    await sql<{
      record_version: string;
      status: string;
    }>`SELECT record_version,status FROM master.supplier WHERE tenant_id=${request.tenantId}::uuid AND business_partner_id=${request.targetBusinessPartnerId}::uuid FOR UPDATE`.execute(
      tx,
    )
  ).rows[0];
  if (
    !supplier ||
    !Number.isSafeInteger(activation["expectedSupplierVersion"]) ||
    Number(supplier.record_version) !== activation["expectedSupplierVersion"]
  )
    throw new MasterDataError(
      409,
      "SUPPLIER_ACTIVATION_VERSION_CHANGED",
      "Refresh supplier readiness and repeat activation approval at the current supplier version",
    );
  if (!["onboarding", "suspended", "inactive"].includes(supplier.status))
    throw new MasterDataError(
      409,
      "SUPPLIER_ACTIVATION_STATE_CONFLICT",
      "Supplier is already active or cannot be activated",
    );
  const policy = await resolveSupplierActivationPolicy(
    request.tenantId,
    request.operatingOrganizationId,
    request.companyCodeId ?? null,
    tx,
  );
  const raw = await new KyselyBusinessPartnerEligibilityRepository().resolve(
    {
      tenantId: request.tenantId,
      businessPartnerId: request.targetBusinessPartnerId,
      role: "supplier",
      operatingOrganizationId: request.operatingOrganizationId,
      ...(request.companyCodeId
        ? { companyCodeId: request.companyCodeId }
        : {}),
      operationCode: policy.operation_code,
      businessDate,
    },
    tx,
  );
  if (!raw)
    throw new MasterDataError(
      404,
      "BUSINESS_PARTNER_NOT_FOUND",
      "Business Partner was not found",
    );
  const reasons = raw.reasons.filter(
    (reason) => reason.code !== "ROLE_INACTIVE",
  );
  const decision = {
    ...raw,
    eligible: !reasons.some((reason) => reason.severity === "blocking"),
    reasons,
  };
  const readiness = {
    ...decision,
    decisionFingerprint: createHash("sha256")
      .update(JSON.stringify({ tenantId: request.tenantId, ...decision }))
      .digest("hex"),
  };
  if (!readiness.eligible)
    throw new MasterDataError(
      409,
      "SUPPLIER_ACTIVATION_READINESS_FAILED",
      `Supplier activation is blocked: ${reasons
        .filter((r) => r.severity === "blocking")
        .map((r) => r.code)
        .join(",")}`,
    );
  if (
    activation["readinessFingerprint"] !== readiness.decisionFingerprint ||
    activation["policyId"] !== policy.id ||
    activation["policyVersion"] !== policy.version
  )
    throw new MasterDataError(
      409,
      "SUPPLIER_ACTIVATION_READINESS_CHANGED",
      "Pin current readiness and activation policy before independent approval",
    );
  return {
    readiness,
    policy,
    expectedSupplierVersion: Number(supplier.record_version),
  };
}
