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
  { code: "role.ownership_subtype.compatible", severity: "error", fieldPath: "$.ownershipClass" },
  { code: "identity.legal_name.required", severity: "error", fieldPath: "$.legalName" },
  { code: "role.requested.required", severity: "error", fieldPath: "$.requestedRole" },
  { code: "role.request_kind.compatible", severity: "error", fieldPath: "$.requestKind" },
  { code: "role.target.required", severity: "error", fieldPath: "$.targetBusinessPartnerId" },
  { code: "organization.operating.required", severity: "error", fieldPath: "$.operatingOrganizationId" },
  { code: "workforce.scope.required", severity: "error", fieldPath: "$.legalEntityId" },
  { code: "workforce.identity.required", severity: "error", fieldPath: "$.firstName" },
  { code: "source.mesh.pin.required", severity: "error", fieldPath: "$.source" },
  { code: "identity.registration_country.format", severity: "error", fieldPath: "$.registrationCountryCode" },
  { code: "identity.legal_name.duplicate", severity: "warning", fieldPath: "$.legalName" },
  { code: "lifecycle.reason.required", severity: "error", fieldPath: "$.reasonCode" },
  { code: "lifecycle.dependencies.required", severity: "error", fieldPath: "$.dependencies" },
  { code: "customer.person.policy", severity: "error", fieldPath: "$.partnerCategory" },
  { code: "customer.sales_scope.required", severity: "error", fieldPath: "$.operatingOrganizationId" },
  { code: "customer.authority_fields.prohibited", severity: "error", fieldPath: "$.proposedPayload" },
  { code: "supplier.qualification_type.required", severity: "error", fieldPath: "$.qualificationTypeCode" },
  { code: "relationship.primary_address.required", severity: "error", fieldPath: "$.relationshipProposals.addresses" },
  { code: "relationship.primary_contact.required", severity: "error", fieldPath: "$.relationshipProposals.contactPersons" },
] as const);

export const businessPartnerRequestRuleset = Object.freeze({
  code: "neon.business_partner.entity_case.phase1",
  version: 3,
  hash: createHash("sha256").update(JSON.stringify(ruleDefinitions)).digest("hex"),
});

export function createBusinessPartnerRequestValidator<Transaction>(options: BusinessPartnerRequestValidatorOptions<Transaction>): BusinessPartnerRequestValidator<Transaction> {
  const createEvaluationId = options.createEvaluationId ?? randomUUID;
  const now = options.now ?? (() => new Date());
  const validate = async ({ context, request }: { context: Parameters<BusinessPartnerRequestValidator<Transaction>["validate"]>[0]["context"]; request: Pick<BusinessPartnerRequest, "kind" | "source" | "requestedRole" | "operatingOrganizationId" | "companyCodeId" | "targetBusinessPartnerId" | "proposedPayload"> }, transaction: Transaction) => {
      const legalName = stringValue(request.proposedPayload, "legalName", "legal_name", "name");
      const registrationCountryCode = stringValue(request.proposedPayload, "registrationCountryCode", "registration_country_code");
      const isNew = request.kind === "new_partner";
      const customer=request.requestedRole==="customer";
      const duplicateCustomerAuthorityFields=["isKeyAccount","is_key_account","creditLimit","credit_limit","creditLimitCurrencyCode","credit_limit_currency_code"].filter(key=>request.proposedPayload[key]!==undefined);
      const requestedCategory=stringValue(request.proposedPayload,"partnerCategory","partner_category");
      const ownershipClass=stringValue(request.proposedPayload,"ownershipClass","ownership_class");
      const qualificationTypeCode=stringValue(request.proposedPayload,"qualificationTypeCode","qualification_type_code");
      const createsCommercialRole=["new_partner","add_supplier","add_customer"].includes(request.kind);
      const subtypeField=customer?"customerType":"supplierType";
      // Match SQL fallback for legacy/malformed snapshots; never repair an approved payload here.
      const subtype=stringValue(request.proposedPayload,subtypeField)??(customer?"corporate":"general");
      const ownershipSubtypeCompatible=(ownershipClass==="internal"||ownershipClass==="external")
        && (ownershipClass==="internal") === (subtype==="intercompany");
      const externalSupplier=request.requestedRole==="supplier"&&ownershipClass==="external";
      const organizationCategory=!requestedCategory||requestedCategory==="organization";
      const relationships=recordValue(request.proposedPayload["relationshipProposals"]),addresses=arrayValue(relationships["addresses"]),contactPersons=arrayValue(relationships["contactPersons"]),contactChannels=arrayValue(relationships["contactChannels"]);
      const primaryAddresses=addresses.filter(item=>item["isPrimary"]===true),primaryContacts=contactPersons.filter(item=>item["isPrimary"]===true),primaryContactKey=primaryContacts.length===1?primaryContacts[0]?.["clientItemKey"]:undefined,primaryChannels=contactChannels.filter(item=>item["isPrimary"]===true&&item["contactClientItemKey"]===primaryContactKey);
      const relationshipRulesApply=isNew&&organizationCategory;
      const lifecycle=["deactivate","reactivate","archive"].includes(request.kind);
      const lifecycleDependencies=request.proposedPayload["dependencies"];
      const requiredDependencyCodes=["supplier_roles","customer_roles","active_organization_assignments","active_employments","effective_blocks","effective_qualifications"];
      const lifecycleDependenciesValid=Array.isArray(lifecycleDependencies)&&requiredDependencyCodes.every(code=>lifecycleDependencies.some(item=>Boolean(item&&typeof item==="object"&&(item as Record<string,unknown>)["code"]===code&&Number.isSafeInteger((item as Record<string,unknown>)["count"])&&typeof (item as Record<string,unknown>)["blocking"]==="boolean")));
      const roleless=["amend_partner","deactivate","reactivate","archive"].includes(request.kind);
      const roleKindCompatible = (isNew && (request.requestedRole === "supplier" || request.requestedRole === "customer"))
        || (request.kind === "add_supplier" && request.requestedRole === "supplier")
        || (request.kind === "add_customer" && request.requestedRole === "customer")
        || ((request.kind === "assign_organization" || request.kind === "configure_company") && (request.requestedRole === "supplier" || request.requestedRole === "customer"))
        || (request.kind === "change_bank" && request.requestedRole === "supplier")
        || (request.kind === "activate_supplier" && request.requestedRole === "supplier")
        || (roleless && !request.requestedRole);
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
        createsCommercialRole ? finding("role.ownership_subtype.compatible","error","$."+subtypeField,ownershipSubtypeCompatible,"BUSINESS_PARTNER_OWNERSHIP_ROLE_MISMATCH",{ownershipClass:ownershipClass??null,subtype}) : skipped("role.ownership_subtype.compatible","error","$."+subtypeField,"ROLE_NOT_CREATED"),
        isNew ? finding("identity.legal_name.required", "error", "$.legalName", Boolean(legalName), "LEGAL_NAME_REQUIRED", { valuePresent: Boolean(legalName) }) : skipped("identity.legal_name.required", "error", "$.legalName", "EXISTING_IDENTITY_REUSED"),
        roleless ? skipped("role.requested.required", "error", "$.requestedRole", "ROLE_NOT_APPLICABLE") : finding("role.requested.required", "error", "$.requestedRole", Boolean(request.requestedRole), "REQUESTED_ROLE_REQUIRED", { requestedRole: request.requestedRole ?? null }),
        finding("role.request_kind.compatible", "error", "$.requestKind", roleKindCompatible, "REQUEST_KIND_ROLE_MISMATCH", { requestKind: request.kind, requestedRole: request.requestedRole ?? null }),
        finding("role.target.required", "error", "$.targetBusinessPartnerId", isNew ? !request.targetBusinessPartnerId : Boolean(request.targetBusinessPartnerId), "TARGET_BUSINESS_PARTNER_REQUIRED", { requestKind: request.kind, targetBusinessPartnerId: request.targetBusinessPartnerId ?? null }),
        roleless ? skipped("organization.operating.required", "error", "$.operatingOrganizationId", "COMMERCIAL_ORGANIZATION_NOT_REQUIRED") : finding("organization.operating.required", "error", "$.operatingOrganizationId", Boolean(request.operatingOrganizationId), "OPERATING_ORGANIZATION_REQUIRED", { operatingOrganizationId: request.operatingOrganizationId ?? null }),
        request.kind === "configure_company" ? finding("company.code.required", "error", "$.companyCodeId", Boolean(request.companyCodeId), "COMPANY_CODE_REQUIRED", { companyCodeId: request.companyCodeId ?? null }) : skipped("company.code.required", "error", "$.companyCodeId", "COMPANY_CODE_NOT_REQUIRED"),
        customer ? finding("customer.sales_scope.required","error","$.operatingOrganizationId",Boolean(request.operatingOrganizationId),"CUSTOMER_SALES_SCOPE_REQUIRED",{operatingOrganizationId:request.operatingOrganizationId??null}) : skipped("customer.sales_scope.required","error","$.operatingOrganizationId","CUSTOMER_SCOPE_NOT_APPLICABLE"),
        customer ? finding("customer.authority_fields.prohibited","error","$.proposedPayload",duplicateCustomerAuthorityFields.length===0,"CUSTOMER_GOVERNED_AUTHORITY_REQUIRED",{prohibitedFields:duplicateCustomerAuthorityFields,designationAuthority:"control.customer_account_designation",creditAuthority:"control.customer_credit_review"}) : skipped("customer.authority_fields.prohibited","error","$.proposedPayload","CUSTOMER_AUTHORITY_NOT_APPLICABLE"),
        externalSupplier ? finding("supplier.qualification_type.required","error","$.qualificationTypeCode",/^[a-z][a-z0-9_.-]{1,62}$/.test(qualificationTypeCode??""),"SUPPLIER_QUALIFICATION_TYPE_REQUIRED",{qualificationTypeCode:qualificationTypeCode??null}) : skipped("supplier.qualification_type.required","error","$.qualificationTypeCode","SUPPLIER_QUALIFICATION_NOT_REQUIRED"),
        isNew ? finding("identity.organization_boundary","error","$.partnerCategory",organizationCategory,"BUSINESS_PARTNER_ORGANIZATION_REQUIRED",{partnerCategory:requestedCategory??"organization"}) : skipped("identity.organization_boundary","error","$.partnerCategory","EXISTING_IDENTITY_REUSED"),
        finding("source.mesh.pin.required", "error", "$.source", meshPinned, "MESH_SOURCE_PIN_REQUIRED", { sourceKind: request.source.kind, sourceVersion: request.source.version ?? null }),
        registrationCountryCode
          ? finding("identity.registration_country.format", "error", "$.registrationCountryCode", /^[A-Z]{2}$/.test(registrationCountryCode), "REGISTRATION_COUNTRY_INVALID", { registrationCountryCode })
          : skipped("identity.registration_country.format", "error", "$.registrationCountryCode", "REGISTRATION_COUNTRY_NOT_PROVIDED"),
        isNew && legalName
          ? finding("identity.legal_name.duplicate", "warning", "$.legalName", candidates.length === 0, "LEGAL_NAME_DUPLICATE_CANDIDATE", { candidateIds: candidates.map(candidate => candidate.id), candidateCount: candidates.length, matchMethod: "exact_legal_name_case_insensitive", sourceEntity: "master.business_partner" })
          : skipped("identity.legal_name.duplicate", "warning", "$.legalName", "LEGAL_NAME_NOT_AVAILABLE"),
        ...(relationshipRulesApply?[finding("relationship.primary_address.required","error","$.relationshipProposals.addresses",addresses.length>0&&primaryAddresses.length===1,"PRIMARY_ADDRESS_REQUIRED",{addressCount:addresses.length,primaryCount:primaryAddresses.length}),finding("relationship.primary_contact.required","error","$.relationshipProposals.contactPersons",contactPersons.length>0&&primaryContacts.length===1&&primaryChannels.length>=1,"PRIMARY_CONTACT_REQUIRED",{contactCount:contactPersons.length,primaryContactCount:primaryContacts.length,primaryChannelCount:primaryChannels.length})]:[]),
        lifecycle ? finding("lifecycle.reason.required","error","$.reasonCode",/^[A-Z][A-Z0-9_.-]{2,126}$/.test(stringValue(request.proposedPayload,"reasonCode","reason_code")??""),"LIFECYCLE_REASON_REQUIRED",{}) : skipped("lifecycle.reason.required","error","$.reasonCode","LIFECYCLE_REASON_NOT_APPLICABLE"),
        lifecycle ? finding("lifecycle.dependencies.required","error","$.dependencies",lifecycleDependenciesValid,"LIFECYCLE_DEPENDENCY_EVIDENCE_REQUIRED",{requiredDependencyCodes}) : skipped("lifecycle.dependencies.required","error","$.dependencies","LIFECYCLE_DEPENDENCIES_NOT_APPLICABLE"),
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
        duplicateSummary: { matchMethod: "exact_legal_name_case_insensitive", sourceEntity: "master.business_partner", sourceField: "legal_name_or_name", scored: false, exactLegalNameCandidateCount: candidates.length, requiresResolution: candidates.length > 0, candidates },
        changeImpact: lifecycle ? {
          requestKind: request.kind,
          targetBusinessPartnerId: request.targetBusinessPartnerId ?? null,
          evidenceVersion: 1,
          assessedAt: now().toISOString(),
          reasonCode: stringValue(request.proposedPayload,"reasonCode","reason_code") ?? null,
          dependencies: Array.isArray(lifecycleDependencies) ? lifecycleDependencies : [],
        } : {
          requestKind: request.kind,
          requestedRole: request.requestedRole ?? null,
          operatingOrganizationId: request.operatingOrganizationId ?? null,
          companyCodeId: request.companyCodeId ?? null,
          targetBusinessPartnerId: request.targetBusinessPartnerId ?? null,
        },
      };
    };
  return { validate, validateProposed: ({context, request}, transaction) => validate({context, request: {...request, proposedPayload: {...request.proposedPayload, ...(request.extensions ? {relationshipProposals: request.extensions} : {})}}}, transaction) };
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
function recordValue(value:unknown):Readonly<Record<string,unknown>>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Readonly<Record<string,unknown>>:{};}
function arrayValue(value:unknown):readonly Readonly<Record<string,unknown>>[]{return Array.isArray(value)?value.map(recordValue):[];}
