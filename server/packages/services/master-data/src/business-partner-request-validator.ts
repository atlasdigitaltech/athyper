import { createHash, randomUUID } from "node:crypto";
import type {
  BusinessPartnerRequest,
  BusinessPartnerRequestValidationFinding,
  BusinessPartnerRequestValidator,
} from "@athyper/server-contract-master-data";

export interface BusinessPartnerDuplicateCandidate {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly legalName?: string;
}

export interface BusinessPartnerDuplicateCandidateReader<Transaction> {
  findExactLegalName(input: {
    readonly tenantId: string;
    readonly legalName: string;
    readonly excludeBusinessPartnerId?: string;
    readonly limit: number;
  }, transaction: Transaction): Promise<readonly BusinessPartnerDuplicateCandidate[]>;
}

export interface BusinessPartnerRequestValidatorOptions<Transaction> {
  readonly duplicates: BusinessPartnerDuplicateCandidateReader<Transaction>;
  readonly createEvaluationId?: () => string;
  readonly now?: () => Date;
}

const ruleDefinitions = Object.freeze([
  { code: "identity.legal_name.required", severity: "error", fieldPath: "$.legalName" },
  { code: "role.requested.required", severity: "error", fieldPath: "$.requestedRole" },
  { code: "role.request_kind.compatible", severity: "error", fieldPath: "$.requestKind" },
  { code: "role.target.required", severity: "error", fieldPath: "$.targetBusinessPartnerId" },
  { code: "organization.operating.required", severity: "error", fieldPath: "$.operatingOrganizationId" },
  { code: "source.mesh.pin.required", severity: "error", fieldPath: "$.source" },
  { code: "identity.registration_country.format", severity: "error", fieldPath: "$.registrationCountryCode" },
  { code: "identity.legal_name.duplicate", severity: "warning", fieldPath: "$.legalName" },
] as const);

export const businessPartnerRequestRuleset = Object.freeze({
  code: "neon.business_partner_request.phase1",
  version: 1,
  hash: createHash("sha256").update(JSON.stringify(ruleDefinitions)).digest("hex"),
});

export function createBusinessPartnerRequestValidator<Transaction>(options: BusinessPartnerRequestValidatorOptions<Transaction>): BusinessPartnerRequestValidator<Transaction> {
  const createEvaluationId = options.createEvaluationId ?? randomUUID;
  const now = options.now ?? (() => new Date());
  return {
    async validate({ context, request }, transaction) {
      const legalName = stringValue(request.proposedPayload, "legalName", "legal_name", "name");
      const registrationCountryCode = stringValue(request.proposedPayload, "registrationCountryCode", "registration_country_code");
      const isNew = request.kind === "new_partner";
      const roleKindCompatible = (isNew && (request.requestedRole === "supplier" || request.requestedRole === "customer"))
        || (request.kind === "add_supplier" && request.requestedRole === "supplier")
        || (request.kind === "add_customer" && request.requestedRole === "customer")
        || ((request.kind === "assign_organization" || request.kind === "configure_company") && (request.requestedRole === "supplier" || request.requestedRole === "customer"));
      const meshPinned = request.source.kind !== "mesh" || (
        request.source.systemCode === "athyper_mesh" && Boolean(request.source.entityCode) && Boolean(request.source.entityId)
        && Boolean(request.source.projectionId) && Number.isSafeInteger(request.source.version) && (request.source.version ?? 0) > 0
        && /^[a-f0-9]{64}$/.test(request.source.payloadHash ?? "")
      );
      const candidates = isNew && legalName
        ? await options.duplicates.findExactLegalName({
            tenantId: context.tenantId,
            legalName,
            ...(request.targetBusinessPartnerId ? { excludeBusinessPartnerId: request.targetBusinessPartnerId } : {}),
            limit: 10,
          }, transaction)
        : [];
      const findings: BusinessPartnerRequestValidationFinding[] = [
        isNew ? finding("identity.legal_name.required", "error", "$.legalName", Boolean(legalName), "LEGAL_NAME_REQUIRED", { valuePresent: Boolean(legalName) }) : skipped("identity.legal_name.required", "error", "$.legalName", "EXISTING_IDENTITY_REUSED"),
        finding("role.requested.required", "error", "$.requestedRole", Boolean(request.requestedRole), "REQUESTED_ROLE_REQUIRED", { requestedRole: request.requestedRole ?? null }),
        finding("role.request_kind.compatible", "error", "$.requestKind", roleKindCompatible, "REQUEST_KIND_ROLE_MISMATCH", { requestKind: request.kind, requestedRole: request.requestedRole ?? null }),
        finding("role.target.required", "error", "$.targetBusinessPartnerId", isNew ? !request.targetBusinessPartnerId : Boolean(request.targetBusinessPartnerId), "TARGET_BUSINESS_PARTNER_REQUIRED", { requestKind: request.kind, targetBusinessPartnerId: request.targetBusinessPartnerId ?? null }),
        finding("organization.operating.required", "error", "$.operatingOrganizationId", Boolean(request.operatingOrganizationId), "OPERATING_ORGANIZATION_REQUIRED", { operatingOrganizationId: request.operatingOrganizationId ?? null }),
        request.kind === "configure_company" ? finding("company.code.required", "error", "$.companyCodeId", Boolean(request.companyCodeId), "COMPANY_CODE_REQUIRED", { companyCodeId: request.companyCodeId ?? null }) : skipped("company.code.required", "error", "$.companyCodeId", "COMPANY_CODE_NOT_REQUIRED"),
        finding("source.mesh.pin.required", "error", "$.source", meshPinned, "MESH_SOURCE_PIN_REQUIRED", { sourceKind: request.source.kind, sourceVersion: request.source.version ?? null }),
        registrationCountryCode
          ? finding("identity.registration_country.format", "error", "$.registrationCountryCode", /^[A-Z]{2}$/.test(registrationCountryCode), "REGISTRATION_COUNTRY_INVALID", { registrationCountryCode })
          : skipped("identity.registration_country.format", "error", "$.registrationCountryCode", "REGISTRATION_COUNTRY_NOT_PROVIDED"),
        isNew && legalName
          ? finding("identity.legal_name.duplicate", "warning", "$.legalName", candidates.length === 0, "LEGAL_NAME_DUPLICATE_CANDIDATE", { candidateIds: candidates.map(candidate => candidate.id), candidateCount: candidates.length })
          : skipped("identity.legal_name.duplicate", "warning", "$.legalName", "LEGAL_NAME_NOT_AVAILABLE"),
      ];
      const failed = findings.filter(item => item.outcome === "failed");
      const counts = { passed: findings.filter(item => item.outcome === "passed").length, failed: failed.length, skipped: findings.filter(item => item.outcome === "skipped").length };
      const valid = !failed.some(item => item.severity === "error");
      return {
        evaluationId: createEvaluationId(),
        evaluatedAt: now().toISOString(),
        ruleset: businessPartnerRequestRuleset,
        valid,
        findings,
        validationSummary: { outcome: valid ? "passed" : "failed", counts, ruleset: businessPartnerRequestRuleset },
        duplicateSummary: { exactLegalNameCandidateCount: candidates.length, requiresResolution: candidates.length > 0, candidates },
        changeImpact: {
          requestKind: request.kind,
          requestedRole: request.requestedRole ?? null,
          operatingOrganizationId: request.operatingOrganizationId ?? null,
          companyCodeId: request.companyCodeId ?? null,
          targetBusinessPartnerId: request.targetBusinessPartnerId ?? null,
        },
      };
    },
  };
}

function finding(ruleCode: string, severity: BusinessPartnerRequestValidationFinding["severity"], fieldPath: string, passed: boolean, messageCode: string, evidenceReference: Readonly<Record<string, unknown>>): BusinessPartnerRequestValidationFinding {
  return { ruleCode, severity, fieldPath, outcome: passed ? "passed" : "failed", messageCode, evidenceReference };
}

function skipped(ruleCode: string, severity: BusinessPartnerRequestValidationFinding["severity"], fieldPath: string, messageCode: string): BusinessPartnerRequestValidationFinding {
  return { ruleCode, severity, fieldPath, outcome: "skipped", messageCode, evidenceReference: {} };
}

function stringValue(payload: Readonly<Record<string, unknown>>, ...keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}
