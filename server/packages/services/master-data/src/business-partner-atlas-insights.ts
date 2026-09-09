import { createBusinessPartnerContactReader } from "./business-partner-atlas-contacts.js";
import { createBusinessPartnerAddressReader } from "./business-partner-atlas-addresses.js";
import { createHash } from "node:crypto";
import type { Authorizer } from "@athyper/server-contract-auth";
import type { AtlasBusinessPartnerInsightOwner, AtlasDisclosureCandidate, AtlasInsightFinding, AtlasInsightOwnerProjection } from "@athyper/server-contract-ai";
import { BUSINESS_PARTNER_360_SECTION_DEFINITIONS, type BusinessPartner360Service, type BusinessPartnerEligibilityService } from "@athyper/server-contract-master-data";
import { MasterDataError } from "./errors.js";

const claim = "neon.relationship.business_partner.read";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const candidate = <T>(value: T): AtlasDisclosureCandidate<T> => ({ state: "evaluated_pass", claims: [claim], value });

/** Owner-only projection. Outcome disclosure never includes raw reasons, protected
 * counts, qualification records, bank details, risk, or owner navigation URLs. */
export function createBusinessPartnerAtlasInsightOwner(options: {
  readonly summary: Pick<BusinessPartner360Service, "summary"> & Partial<Pick<BusinessPartner360Service, "section">>;
  readonly eligibility?: Pick<BusinessPartnerEligibilityService, "resolve">;
  readonly authorizer: Authorizer;
  readonly now?: () => Date;
}): AtlasBusinessPartnerInsightOwner {
  return { ...(options.summary.section ? {readContacts: createBusinessPartnerContactReader(options.summary as Pick<BusinessPartner360Service, "section">), readAddresses: createBusinessPartnerAddressReader(options.summary as Pick<BusinessPartner360Service, "section">)} : {}), async read(input) {
    if (input.context.planeKey !== "neon") throw new MasterDataError(403, "BP_ATLAS_DENIED", "Business Partner insight is unavailable");
    const resource = { tenantId: input.context.tenantId, businessPartnerId: input.recordId, operatingOrganizationId: input.operatingOrganizationId, companyCodeId: input.companyCodeId };
    const permitted = async (permissionCode: string) => (await options.authorizer.authorize({ context: input.context, permissionCode, resource })).allowed;
    const evaluatedAt = (options.now?.() ?? new Date()).toISOString();
    const scope = { entityCode: "business_partner", fingerprint: hash({ ...resource, role: input.role, operation: input.operation, businessDate: input.businessDate }), ...(input.role ? {role: input.role} : {}), ...(input.operatingOrganizationId ? {operatingOrganizationId: input.operatingOrganizationId} : {}), ...(input.companyCodeId ? {companyCodeId: input.companyCodeId} : {}) };
    const findings: AtlasDisclosureCandidate<AtlasInsightFinding>[] = [];
    const evidence: AtlasInsightOwnerProjection["evidence"][number][] = [];
    let complete = true;
    const finding = (code: string, state: AtlasInsightFinding["state"], facts: AtlasInsightFinding["facts"] = {}, ruleVersion = "bp-atlas/1", evidenceIds: readonly string[] = []) => findings.push(candidate({ id: code, code, state, severity: state === "evaluated_fail" ? (facts.requirement === "recommended" ? "warning" : "blocker") : "info", facts, ruleVersion, evidenceIds, actionIds: [] }));
    const result = (): AtlasInsightOwnerProjection => ({ evaluationMode: "user_scoped", scope: candidate(scope), coverage: candidate({target: "record", state: complete ? "complete" : "partial"}), evaluatedAt, freshness: "current", evidence, findings, actions: [] });
    // Explicit transaction coordinates are mandatory even when the directory is tenant-wide.
    if (!input.role || !input.operatingOrganizationId || !input.companyCodeId || (input.kind === "eligibility" && (!input.operation || !input.businessDate))) {
      complete = false; finding("scope_required", "not_evaluated", {
        missingRole: !input.role,
        missingOperatingOrganization: !input.operatingOrganizationId,
        missingCompany: !input.companyCodeId,
        missingOperation: input.kind === "eligibility" && !input.operation,
        missingBusinessDate: input.kind === "eligibility" && !input.businessDate,
      }); return result();
    }
    // A missing-input response contains no owner facts. The Atlas tool already
    // admitted the record through Records; scope authorization starts only when
    // an actual assessment can be evaluated. Never infer an authorization scope.
    if (!await permitted(claim)) { complete = false; finding("scoped_assessment_unavailable", "not_evaluated"); return result(); }
    try {
      const summary = await options.summary.summary({ context: input.context, businessPartnerId: input.recordId, roleLens: input.role, operatingOrganizationId: input.operatingOrganizationId, companyCodeId: input.companyCodeId });
      if (summary.scope.businessPartnerId !== input.recordId || summary.scope.roleLens !== input.role || summary.scope.operatingOrganizationId !== input.operatingOrganizationId || summary.scope.companyCodeId !== input.companyCodeId) throw new MasterDataError(403, "BP_ATLAS_DENIED", "Business Partner insight is unavailable");
      const c = summary.completeness;
      if (input.kind === "eligibility") {
        if (!options.eligibility) { complete = false; finding("eligibility", "provider_unavailable"); return result(); }
        const decision = await options.eligibility.resolve({context: input.context, businessPartnerId: input.recordId, role: input.role, operatingOrganizationId: input.operatingOrganizationId, companyCodeId: input.companyCodeId, operationCode: input.operation!, businessDate: input.businessDate!});
        if (decision.businessPartnerId !== input.recordId || decision.role !== input.role || decision.operatingOrganizationId !== input.operatingOrganizationId || decision.companyCodeId !== input.companyCodeId || decision.operationCode !== input.operation || decision.businessDate !== input.businessDate) throw new MasterDataError(403, "BP_ATLAS_DENIED", "Business Partner insight is unavailable");
        // Existing eligibility resolve contract authorizes the decision under the
        // caller's scoped BP read permission. It does not authorize its raw inputs.
        evidence.push(candidate({id: "eligibility", entityCode: "business_partner", recordId: input.recordId, descriptorRevision: "bp-eligibility/1", sourceRevision: hash({eligible: decision.eligible, scope}), sourceRevisionKind: "projected_content_hash", observedAt: evaluatedAt, ruleVersion: "bp-eligibility/1"}));
        finding("eligibility", decision.eligible ? "evaluated_pass" : "evaluated_fail", {operation: input.operation!, businessDate: input.businessDate!, eligible: decision.eligible}, "bp-eligibility/1", ["eligibility"]);
        return result();
      }
      if (c.status === "definition_unavailable") { complete = false; finding("completeness", "definition_unavailable"); return result(); }
      if (c.readOnly || c.status === "not_applicable") { complete = false; finding("completeness", "not_evaluated"); return result(); }
      // Check both satisfied AND missing requirements. Hidden absence must not
      // become a missing-field oracle. Do not emit aggregate scores for a subset.
      for (const [severity, requirements] of [["required", c.required], ["recommended", c.recommended]] as const) {
        for (const item of requirements) {
          const section = BUSINESS_PARTNER_360_SECTION_DEFINITIONS.find(s => s.code === item.sectionCode);
          const manifest = summary.sections.find(s => s.code === item.sectionCode);
          const permissions = section ? [section.permission, ...section.fieldPermissions] : [];
          let allowed = !!section && manifest?.authorization === "granted" && !manifest.reasonCode && item.state !== "restricted_satisfied";
          for (const permission of permissions) if (!await permitted(permission)) allowed = false;
          if (!allowed) { complete = false; continue; }
          const id = `${severity}:${item.code}`;
          const facts = { fieldCode: item.fieldCode, sectionCode: item.sectionCode, requirement: severity, savedData: true };
          evidence.push(candidate({id, entityCode: "business_partner", recordId: input.recordId, descriptorRevision: c.definitionHash, sourceRevision: hash({state: item.state, facts, definition: c.definitionHash, scope}), sourceRevisionKind: "projected_content_hash", observedAt: c.evaluatedAt, ruleVersion: c.definitionVersion}));
          finding(id, item.state === "missing" ? "evaluated_fail" : "evaluated_pass", facts, c.definitionVersion, [id]);
        }
      }
      if (complete) finding("completeness", c.status === "complete" ? "evaluated_pass" : "evaluated_fail", {savedData: true}, c.definitionVersion, evidence.map(e => e.value.id));
      else finding("assessment_partial", "not_evaluated");
      // Briefs use the same authorized evidence, bounded to three findings.
      if (input.kind === "brief") {
        findings.sort((a,b) => Number(b.value.state === "evaluated_fail") - Number(a.value.state === "evaluated_fail"));
        if (findings.length > 3) { findings.splice(3); complete = false; }
        const ids = new Set(findings.flatMap(f => f.value.evidenceIds));
        for (let i = evidence.length - 1; i >= 0; i--) if (!ids.has(evidence[i]!.value.id)) evidence.splice(i, 1);
      }
      return result();
    } catch (error) {
      // Known scoped access/availability failures preserve the shared brief with
      // no owner facts. Coordinate substitution and unknown failures stay fatal.
      if (error instanceof MasterDataError && error.status === 503) { complete = false; evidence.splice(0); findings.splice(0); finding(input.kind, "provider_unavailable"); return result(); }
      if (error instanceof MasterDataError && [400, 403, 404].includes(error.status) && error.code !== "BP_ATLAS_DENIED") { complete = false; evidence.splice(0); findings.splice(0); finding("scoped_assessment_unavailable", "not_evaluated"); return result(); }
      throw new MasterDataError(403, "BP_ATLAS_DENIED", "Business Partner insight is unavailable");
    }
  }};
}
