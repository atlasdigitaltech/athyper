import type { Authorizer } from "@athyper/server-contract-auth";
import type { BusinessPartner360Query } from "@athyper/server-contract-master-data";
import { BUSINESS_PARTNER_360_PERMISSIONS as P } from "@athyper/server-contract-master-data";
import { MasterDataError } from "../../errors.js";

/** Versioned, closed field paths. `*` is an array element only; objects cannot
 * introduce new fields through a wildcard. No unrestricted JSON leaf exists. */
export interface BusinessPartnerProviderPolicyV1 {
  readonly schemaVersion: 1;
  readonly fields: readonly {
    readonly path: string;
    readonly operation: string;
    readonly permission: string;
    readonly representation?: "masked";
  }[];
}
const fields = (
  operation: string,
  permission: string,
  prefix: string,
  names: string,
) =>
  names
    .split(" ")
    .map((name) => ({ path: prefix + name, operation, permission }));
const common = "id effectiveFrom effectiveUntil";
const crosswalkFields = "id sourceDomainCode sourceCode targetDomainCode targetCode targetName mappingType confidence provenance verified readOnly";
const definition = (
  ...parts: BusinessPartnerProviderPolicyV1["fields"][]
): BusinessPartnerProviderPolicyV1 =>
  Object.freeze({
    schemaVersion: 1,
    fields: Object.freeze(
      parts.flat().map((field) => Object.freeze({ ...field })),
    ),
  });
const identity = fields(
  "identity_read",
  P.identity,
  "items.*.",
  `${common} kind code name legalName category ownershipClass legalClassification legalForm registrationCountryCode incorporationDate websiteUrl lifecycleStatus industryDomainCode industryCode industryName assignmentKind primary verified sourceSystem sourceReference status sourceSystemCode externalEntityCode externalId externalCode`,
);
const contact = fields(
  "contacts_read",
  P.contact,
  "items.*.",
  "id displayName businessTitle departmentName primary",
);
const address = fields(
  "addresses_read",
  P.address,
  "items.*.",
  `${common} purpose addressKind locality region stateRegionCode regionEntryMode postalCode countryCode timezoneCode formattedAddress primary validationStatus validationProvider validationConfidence validatedAt`,
);
const bank = fields(
  "bank_read",
  P.bankMasked,
  "accounts.*.",
  `${common} bankProjectionId receivedAt disclosureExpiresAt source sourceAccountId disclosureVersion disclosureStatus bic accountIdType linkId accountId lastFour accountHolderName currencyCode bankName bankCountryCode purpose relationshipRole companyCodeId primary accountStatus revealable`,
);
const caseFields = fields(
  "requests_read",
  P.request,
  "items.*.",
  "id requestNo requestKind sourceKind requestedRole status workflowRequestId createdAt createdBy submittedAt submittedBy approvedAt approvedBy appliedAt appliedBy applicationResultKind applicationReasonCode href",
);
const roleFields = fields(
  "read",
  P.record,
  "roles.*.",
  "id role roleCode status",
);
const orgFields = fields(
  "read",
  P.record,
  "organizationAssignments.*.",
  `${common} operatingOrganizationId partnerRole status`,
);
const scalarContext = fields("read", P.record, "", "scopeState readOnly");
/** Explicit BP section field policies. Unknown provider versions remain closed. */
export const businessPartnerProviderPolicies: Readonly<
  Record<string, BusinessPartnerProviderPolicyV1>
> = Object.freeze({
  overview: definition(),
  governance: definition(
    fields(
      "identity_read",
      P.identity,
      "items.*.",
      "id kind relationTypeCode memberName memberType memberBusinessPartnerId memberCountryCode businessTitle ownershipPercent votingPercent beneficialOwnershipPercent appointedDate endOfTerm status",
    ),
  ),
  comments: definition(
    fields(
      "comments_read",
      P.comment,
      "items.*.",
      "id text authorName visibility status createdAt parentCommentId",
    ),
  ),
  attachments: definition(
    fields(
      "attachments_read",
      P.attachment,
      "items.*.",
      "id attachmentId fileName contentType sizeBytes createdAt",
    ),
  ),
  "business-activity": definition(
    fields(
      "activity_read",
      P.activity,
      "providers.*.",
      "provider state href reasonCode observedAt",
    ),
    fields(
      "activity_read",
      P.activity,
      "providers.*.metrics.*.",
      "code label value unit",
    ),
  ),
  "qualifications-certificates": definition(
    ...["qualifications.*.coverage.*.","blocks.*.coverage.*."].map(prefix=>fields("qualification_read",P.qualification,prefix,"scope_group scope_kind scope_mode selection_mode commercial_capacity_code operating_organization_id company_code_id commodity_category_id commodity_classification_id country_code country_purpose tax_jurisdiction_id organization_unit_id hierarchy_version resolution_fingerprint")),
    fields("qualification_read", P.qualification, "collections.commodity_crosswalk_reference_evidence.*.", crosswalkFields),
    fields("certificate_read", P.certificate, "certifications.*.attachment.", "attachmentId fileName contentType sizeBytes status downloadHref"),
    ...["commodityCapabilities.*.commodityCodes.*.", "qualifications.*.commodityCapabilities.*.commodityCodes.*.", "qualifications.*.commodityCodes.*."].map(prefix =>
      fields("qualification_read", P.qualification, prefix + "crosswalks.*.", crosswalkFields)),
    fields("qualification_read", P.qualification, "", "readOnly scopeState"),
    fields(
      "qualification_read",
      P.qualification,
      "qualifications.*.",
      `${common} partnerRole contextKind contextId typeCode decision decisionReason operatingOrganizationId companyCodeId commodityCapabilityId commodityCapabilityIds.* commodityCategoryCode commodityCategoryName nextReviewAt manageHref`,
    ),
    fields(
      "qualification_read",
      P.qualification,
      "preferences.*.",
      `${common} status operatingOrganizationId companyCodeId commodityCategoryId commodityCategoryIds.* rationale manageHref`,
    ),
    fields(
      "qualification_read",
      P.qualification,
      "blocks.*.",
      `${common} roleScope operationCode operationCodes.* contextKind contextId restrictionMode targetEntityType targetEntityId targetLineId reasonCode reason status operatingOrganizationId companyCodeId manageHref`,
    ),
    fields(
      "certificate_read",
      P.certificate,
      "certifications.*.",
      `${common} name customName certificationTypeId issuingBody certificateNumber certifiedBy status companyCodeId manageHref`,
    ),
    ...[
      "commodityCapabilities.*.",
      "qualifications.*.commodityCapabilities.*.",
    ].map((prefix) =>
      fields(
        "qualification_read",
        P.qualification,
        prefix,
        `${common} partnerRole categoryId categoryCode categoryName status notes manageHref`,
      ),
    ),
    ...[
      "commodityCapabilities.*.commodityCodes.*.",
      "qualifications.*.commodityCapabilities.*.commodityCodes.*.",
      "qualifications.*.commodityCodes.*.",
    ].map((prefix) =>
      fields(
        "qualification_read",
        P.qualification,
        prefix,
        "domainCode code name mappingType primary routingDefault confidence provenance",
      ),
    ),
  ),
  credit: definition(
    fields("credit_read", P.credit, "", "title readOnly scopeState createHref"),
    fields(
      "credit_read",
      P.credit,
      "currentLimit.",
      "creditReviewId amount currencyCode decision effectiveFrom effectiveUntil",
    ),
    fields(
      "credit_read",
      P.credit,
      "reviews.*.",
      `${common} reviewTypeCode requestedCreditLimit requestedCurrencyCode approvedCreditLimit approvedCurrencyCode decision decisionReason effectiveFrom effectiveUntil reviewedAt companyCodeId manageHref`,
    ),
  ),
  network: definition(
    fields("network_read", P.network, "", "nextCursor"),
    fields(
      "network_read", P.network, "commercialRelationships.*.",
      `${common} kind sourceBusinessPartnerId targetBusinessPartnerId direction readOnly relationshipTypeCode countryCode status`,
    ),
    fields(
      "identity_read", P.identity, "governanceRelations.*.",
      `${common} kind relationTypeCode memberName memberType businessTitle ownershipPercent appointedDate endOfTerm status`,
    ),
    fields(
      "network_read", P.network, "collections.commercial_relationships.*.",
      "id source_business_partner_id target_business_partner_id relationship_type_code country_code effective_from effective_until status",
    ),
    fields(
      "identity_read", P.identity, "collections.governance_relations.*.",
      "id relation_type_code member_name member_type business_title ownership_pct appointed_date end_of_term status",
    ),
    fields(
      "network_read",
      P.network,
      "local.accountLink.",
      "id networkRelationshipId sourceTenantId sourceNetworkAccountId recipientNetworkAccountId proposedRole status approvedAt terminatedAt",
    ),
    fields(
      "network_read",
      P.network,
      "local.received.",
      "snapshotId publicationId publicationVersion lifecycleVersion state receivedAt",
    ),
    fields(
      "network_read",
      P.network,
      "local.match.",
      "id state algorithmCode algorithmVersion matchedAt diffHash fieldPaths.*",
    ),
    fields(
      "network_read",
      P.network,
      "local.acceptance.",
      "id state acceptedFields.* ignoredFields.* acceptanceHash preparedAt businessPartnerRequestId recordedAt",
    ),
    fields(
      "network_read",
      P.network,
      "local.bankDisclosure.",
      "present status disclosureVersion lifecycleVersion observedAt",
    ),
    fields("network_read", P.network, "live.", "state reasonCode"),
    fields(
      "network_read",
      P.network,
      "live.summary.authorization.",
      "decision permissionCode networkRelationshipId",
    ),
    fields(
      "network_read",
      P.network,
      "live.summary.relationship.",
      "id status relationshipType direction effectiveFrom effectiveUntil",
    ),
    fields(
      "network_read",
      P.network,
      "live.summary.publication.",
      "id status publicationVersion lifecycleVersion publishedAt withdrawnAt",
    ),
    ...["local.provenance.*.", "live.summary.provenance.*."].map((prefix) =>
      fields(
        "network_read",
        P.network,
        prefix,
        "authority authorityTenantId sourceObject observedAt schemaCode schemaVersion fieldSetCode hash freshness",
      ),
    ),
  ),

  identity: definition(
    fields("identity_read", P.identity, "collections.industry_crosswalk_reference_evidence.*.", crosswalkFields),
    fields("identity_read", P.identity, "items.*.crosswalks.*.", crosswalkFields),
    identity,
    fields(
      "identity_read",
      P.identity,
      "items.*.parent.",
      "id code name",
    ),
    fields("identity_read", P.identity, "items.*.", "aliases.*"),
  ),
  contacts: definition(
    contact,
    fields(
      "contacts_read",
      P.contact,
      "items.*.roles.*.",
      "code primary effectiveFrom effectiveUntil",
    ),
    fields(
      "contacts_read",
      P.contact,
      "items.*.channels.*.",
      "id type purpose primary verified effectiveFrom effectiveUntil quality",
    ),
    fields(
      "contact_sensitive_read",
      "neon.relationship.business_partner.read_contact_sensitive",
      "items.*.channels.*.",
      "value",
    ),
  ),
  addresses: definition(
    address,
    fields(
      "address_sensitive_read",
      "neon.relationship.business_partner.read_address_sensitive",
      "items.*.",
      "lines.*",
    ),
    fields(
      "addresses_read",
      P.address,
      "items.*.events.*.",
      "id eventType occurredAt resultStatus confidence reasonCode",
    ),
  ),
  "identifiers-tax": definition(
    fields(
      "identifier_read",
      P.identifierMasked,
      "items.*.",
      `${common} kind schemeCode registrationTypeCode issuingAuthority issuingCountryCode jurisdictionCode taxTypeCode jurisdictionCountryCode jurisdictionStateRegionCode sourceSystemCode externalEntityCode externalId externalCode primary verified revealable revealVerificationRequired`,
    ),
    [
      {
        path: "items.*.maskedValue",
        operation: "identifier_read",
        permission: P.identifierMasked,
        representation: "masked",
      },
    ],
  ),
  banking: definition(
    fields("bank_read", P.bankMasked, "collections.bank_accounts.*.", "id account_holder_name account_last4 currency_code status bank_name branch_name branch_code bic reveal_link_id revealable revealVerificationRequired"),
    fields("bank_read", P.bankMasked, "collections.payment_instrument_links.*.", "id payment_instrument_id owner_id relationship_role purpose effective_from effective_until account_last4 is_primary"),
    fields("bank_read", P.bankMasked, "collections.bank_provisional_references.*.", "id submitted_name submitted_country submitted_bic status resolved_institution_id resolved_branch_id"),
    fields(
      "bank_read",
      P.bankMasked,
      "",
      "readOnly scopeState manageHref",
    ),
    bank,
    [
      {
        path: "accounts.*.maskedAccount",
        operation: "bank_read",
        permission: P.bankMasked,
        representation: "masked",
      },
    ],
  ),
  "roles-scope": definition(
    scalarContext,
    roleFields,
    orgFields,
    fields(
      "read",
      P.record,
      "legalEntityAssignments.*.",
      `${common} legalEntityId`,
    ),
    fields(
      "read",
      P.record,
      "companies.*.",
      "companyCodeId companyName operatingOrganizationId operatingOrganizationName role roleStatus assignmentStatus profileStatus",
    ),
  ),
  "supplier-company": definition(
    fields("supplier_company_read", P.record, "", "scopeState readOnly"),
    fields(
      "supplier_company_read",
      P.record,
      "supplier.",
      "id code type status",
    ),
    fields(
      "supplier_company_read",
      P.record,
      "organizationAssignment.",
      `${common} operatingOrganizationId partnerRole status`,
    ),
    fields(
      "supplier_company_read",
      P.record,
      "profile.",
      "id companyCodeId currencyCode paymentTermId defaultAccountingProfileId defaultDimensionSetId preferredRemittanceBankLinkId status",
    ),
  ),
  "customer-company": definition(
    fields("customer_company_read", P.record, "", "scopeState readOnly"),
    fields(
      "customer_company_read",
      P.record,
      "customer.",
      "id code type status",
    ),
    fields(
      "customer_company_read",
      P.record,
      "customer.designations.*.",
      `${common} type priorityTier`,
    ),
    fields(
      "customer_company_read",
      P.record,
      "organizationAssignment.",
      `${common} operatingOrganizationId partnerRole status`,
    ),
    fields(
      "customer_company_read",
      P.record,
      "profile.",
      "id companyCodeId currencyCode paymentTermId defaultAccountingProfileId defaultDimensionSetId statementCycleCode status",
    ),
  ),
  requests: definition(
    caseFields,
    fields(
      "requests_read",
      P.request,
      "openWork.",
      "active returned pendingApproval approved failed",
    ),
    fields("requests_read", P.request, "", "nextCursor"),
  ),
  activity: definition(
    fields(
      "activity_read",
      P.activity,
      "items.*.",
      "id eventCode title occurredAt actorId source sourceService requestId entityType entityId outcome changedFields.* evidenceHref",
    ),
    fields("activity_read", P.activity, "", "nextCursor"),
  ),
});

export async function projectBusinessPartnerProvider(input: {
  readonly query: BusinessPartner360Query;
  readonly section: string;
  readonly data: unknown;
  readonly authorizer: Authorizer;
  readonly policy?: BusinessPartnerProviderPolicyV1;
  readonly authorizeCertificateAttachment?: (attachmentId: string) => Promise<boolean>;
}) {
  const policy = input.policy ?? businessPartnerProviderPolicies[input.section];
  if (!policy || policy.schemaVersion !== 1)
    throw new MasterDataError(
      503,
      "BP_PROVIDER_POLICY_UNAVAILABLE",
      "Provider field policy is unavailable",
    );
  if (
    Object.keys(policy).some(
      (key) => !["schemaVersion", "fields"].includes(key),
    ) ||
    !Array.isArray(policy.fields) ||
    policy.fields.length > 2048 ||
    policy.fields.some(
      (field) =>
        Object.keys(field).some(
          (key) =>
            !["path", "operation", "permission", "representation"].includes(
              key,
            ),
        ) ||
        !/^([a-z][a-z0-9_.-]*)$/.test(field.operation) ||
        typeof field.permission !== "string" ||
        !field.permission ||
        (field.representation !== undefined &&
          field.representation !== "masked"),
    )
  )
    throw new MasterDataError(
      503,
      "BP_PROVIDER_POLICY_INVALID",
      "Provider policy is invalid",
    );
  const paths = new Map(policy.fields.map((field) => [field.path, field]));
  if (
    paths.size !== policy.fields.length ||
    policy.fields.some(
      (field) =>
        !field.path
          .split(".")
          .every(
            (token: string) =>
              token === "*" || /^[a-zA-Z][a-zA-Z0-9_]*$/.test(token),
          ),
    )
  )
    throw new MasterDataError(
      503,
      "BP_PROVIDER_POLICY_INVALID",
      "Provider policy is invalid",
    );
  const cache = new Map<string, boolean>();
  let visited = 0;
  const walk = async (
    value: unknown,
    path: string,
    scope: Readonly<Record<string, unknown>>,
    depth: number,
  ): Promise<unknown> => {
    if (value === undefined) return undefined;
    if (++visited > 20000 || depth > 24)
      throw new MasterDataError(
        503,
        "BP_PROVIDER_PROJECTION_LIMIT",
        "Provider projection exceeds its bounded capacity",
      );
    if (
      path &&
      ![...paths.keys()].some(
        (key) => key === path || key.startsWith(path + "."),
      )
    )
      return undefined;
    if (Array.isArray(value)) {
      const items = [];
      for (const child of value) {
        const projected = await walk(
          child,
          path ? path + ".*" : "*",
          scope,
          depth + 1,
        );
        if (projected !== undefined) items.push(projected);
      }
      return items;
    }
    if (value !== null && typeof value === "object") {
      if (![Object.prototype, null].includes(Object.getPrototypeOf(value)))
        throw new MasterDataError(
          503,
          "BP_PROVIDER_VALUE_INVALID",
          "Provider value is invalid",
        );
      const child = value as Record<string, unknown>;
      if (path === "certifications.*.attachment") {
        const id = child["attachmentId"];
        if (typeof id !== "string" || !input.authorizeCertificateAttachment ||
          !await input.authorizeCertificateAttachment(id)) return undefined;
      }
      if (
        path === "items.*" &&
        (input.section === "comments" || input.section === "attachments")
      ) {
        const id = child["id"],
          resourceCode =
            input.section === "comments"
              ? "document.comment"
              : "document.attachment";
        if (typeof id !== "string")
          throw new MasterDataError(
            503,
            "BP_CHILD_IDENTITY_INVALID",
            "Independent document identity is unavailable",
          );
        const decision = await input.authorizer.authorize({
          context: input.query.context,
          permissionCode:
            input.section === "comments" ? P.comment : P.attachment,
          resource: {
            tenantId: input.query.context.tenantId,
            // Document capabilities use independent resource grants, not BP operation bindings.
            resourceCode,
            resourceId: id,
            recordId: id,
          },
        });
        if (
          !decision.allowed &&
          decision.reason === "entity_authorization_unavailable"
        )
          throw new MasterDataError(
            503,
            "BP_PROVIDER_AUTHORIZATION_UNAVAILABLE",
            "Independent document authorization is unavailable",
          );
        if (!decision.allowed) return undefined;
      }
      const row = value as Record<string, unknown>,
        next = {
          ...scope,
          ...(typeof row["kind"] === "string"
            ? { providerKind: row["kind"] }
            : {}),
          ...(typeof row["operatingOrganizationId"] === "string"
            ? { operatingOrganizationId: row["operatingOrganizationId"] }
            : {}),
          ...(typeof row["companyCodeId"] === "string"
            ? { companyCodeId: row["companyCodeId"] }
            : {}),
        };
      const result: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(row)) {
        const projected = await walk(
          child,
          path ? path + "." + key : key,
          next,
          depth + 1,
        );
        if (projected !== undefined) result[key] = projected;
      }
      return Object.keys(result).length ? result : undefined;
    }
    let field = paths.get(path);
    if (!field) return undefined;
    if (input.section === "identifiers-tax" && scope["providerKind"] === "tax")
      field = { ...field, operation: "tax_read", permission: P.taxMasked };
    if (typeof value === "number" && !Number.isFinite(value))
      throw new MasterDataError(
        503,
        "BP_PROVIDER_VALUE_INVALID",
        "Provider numeric value is invalid",
      );
    if (
      value !== null &&
      !["string", "number", "boolean"].includes(typeof value)
    )
      throw new MasterDataError(
        503,
        "BP_PROVIDER_VALUE_INVALID",
        "Provider scalar is invalid",
      );
    const key = JSON.stringify([field.operation, field.path, scope]);
    let allowed = cache.get(key);
    if (allowed === undefined) {
      const decision = await input.authorizer.authorize({
        context: input.query.context,
        permissionCode: field.permission,
        resource: {
          ...scope,
          tenantId: input.query.context.tenantId,
          businessPartnerId: input.query.businessPartnerId,
          // Provider selection is not a legacy IAM operation-binding coordinate.
          // The backend maps this hint to the independently checked native binding.
          providerOperationKey: field.operation,
          providerFieldPath: path,
        },
      });
      if (
        !decision.allowed &&
        decision.reason === "entity_authorization_unavailable"
      )
        throw new MasterDataError(
          503,
          "BP_PROVIDER_AUTHORIZATION_UNAVAILABLE",
          "Provider authorization is unavailable",
        );
      allowed = decision.allowed;
      cache.set(key, allowed);
    }
    if (!allowed) return undefined;
    return field.representation === "masked" && typeof value === "string"
      ? "••••" + (value.length > 4 ? value.slice(-4) : "")
      : value;
  };
  return (
    (await walk(
      input.data,
      "",
      {
        ...(input.query.operatingOrganizationId
          ? { operatingOrganizationId: input.query.operatingOrganizationId }
          : {}),
        ...(input.query.companyCodeId
          ? { companyCodeId: input.query.companyCodeId }
          : {}),
      },
      0,
    )) ?? {}
  );
}

/** Summary reuses the same protected-value boundaries as detailed sections. */
export const businessPartnerSummaryFieldPolicy: BusinessPartnerProviderPolicyV1 =
  definition(
    fields(
      "contacts_read",
      P.contact,
      "primaryContact.",
      "id displayName purpose primary verified effectiveFrom effectiveUntil",
    ),
    fields(
      "contact_sensitive_read",
      "neon.relationship.business_partner.read_contact_sensitive",
      "primaryContact.",
      "email phone",
    ),
    fields(
      "addresses_read",
      P.address,
      "primaryAddress.",
      "id purpose countryCode primary verified effectiveFrom effectiveUntil",
    ),
    fields(
      "address_sensitive_read",
      "neon.relationship.business_partner.read_address_sensitive",
      "primaryAddress.",
      "line1 lines.* locality region postalCode",
    ),
    fields(
      "identifier_read",
      P.identifierMasked,
      "identifiers.*.",
      "id schemeCode jurisdictionCode primary verified",
    ),
    [
      {
        path: "identifiers.*.maskedValue",
        operation: "identifier_read",
        permission: P.identifierMasked,
        representation: "masked",
      },
    ],
  );
