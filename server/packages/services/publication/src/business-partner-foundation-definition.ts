import {
  BUSINESS_PARTNER_DEFINITION_BUNDLE_SCHEMA_V1,
  type BusinessPartnerDefinitionBundleV1,
} from "@athyper/server-contract-publication";

const sources = ["internal", "portal", "mesh", "import", "api"] as const;
const commonIdentity = [
  "partner.name",
  "partner.countryCode",
  "partner.category",
];
const organizationIdentity = [
  ...commonIdentity,
  "partner.registrationNumber",
  "partner.taxIdentifiers",
  "partner.addresses",
  "partner.contacts",
];
const countryOptions = [
  { value: "GB", label: "United Kingdom" },
  { value: "MY", label: "Malaysia" },
  { value: "SG", label: "Singapore" },
  { value: "US", label: "United States" },
];
const addressPurposes = [
  { value: "default", label: "Default" },
  { value: "correspondence", label: "Correspondence" },
  { value: "remit_to", label: "Remit to" },
  { value: "ship_from", label: "Ship from" },
];
const contactPurposes = [
  { value: "default", label: "Default" },
  { value: "correspondence", label: "Correspondence" },
  { value: "procurement", label: "Procurement" },
  { value: "notification", label: "Notification" },
];
const channelOptions = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "website", label: "Website" },
];
export const supplierRequestForm = {
  schema: "athyper.business-partner-request-form/1",
  version: "2.2.0",
  title: "New supplier onboarding request",
  description:
    "Start an internal NEON request. Approval creates the partner and initial supplier organization assignment.",
  sections: [
    {
      key: "scope",
      title: "Onboarding scope",
      description: "Select the organization that owns this request.",
      fields: [
        {
          key: "operatingOrganizationId",
          path: "operatingOrganizationId",
          target: "context",
          label: "Operating organization",
          widget: "operating_organization",
          required: true,
        },
      ],
    },
    {
      key: "identity",
      title: "Organization identity",
      fields: [
        {
          key: "name",
          path: "name",
          target: "canonical",
          label: "Registered name",
          widget: "text",
          required: true,
          maxLength: 320,
          autoComplete: "organization",
        },
        {
          key: "registrationCountryCode",
          path: "registrationCountryCode",
          target: "canonical",
          label: "Registration country",
          widget: "lookup",
          required: true,
          lookup: { code: "iso.country", options: countryOptions },
        },
        {
          key: "ownershipClass",
          path: "ownershipClass",
          target: "canonical",
          label: "Ownership",
          widget: "lookup",
          required: true,
          defaultValue: "external",
          lookup: {
            code: "master.business_partner_ownership",
            options: [
              { value: "external", label: "External" },
              { value: "internal", label: "Internal" },
            ],
          },
        },
        {
          key: "legalClassification",
          path: "legalClassification",
          target: "canonical",
          label: "Legal classification",
          widget: "lookup",
          required: false,
          lookup: {
            code: "master.business_partner_legal_classification",
            options: [
              { value: "government", label: "Government" },
              { value: "nonprofit", label: "Nonprofit" },
              { value: "sole_proprietor", label: "Sole proprietor" },
            ],
          },
        },
        {
          key: "supplierType",
          path: "supplierType",
          target: "canonical",
          label: "Supplier type",
          widget: "lookup",
          required: true,
          defaultValue: "general",
          lookup: {
            code: "master.supplier_type",
            options: [
              { value: "general", label: "General" },
              { value: "strategic", label: "Strategic" },
              { value: "service", label: "Service" },
              { value: "carrier", label: "Carrier" },
              { value: "intercompany", label: "Intercompany" },
            ],
          },
        },
        {
          key: "qualificationTypeCode",
          path: "qualificationTypeCode",
          target: "canonical",
          label: "Qualification type",
          helpText: "Policy used for the initial supplier qualification",
          widget: "lookup",
          required: true,
          defaultValue: "compliance",
          lookup: {
            code: "control.qualification_type",
            options: [
              { value: "compliance", label: "Compliance" },
              { value: "basic", label: "Basic" },
            ],
          },
          visibility: {
            field: "ownershipClass",
            operator: "equals",
            value: "external",
          },
        },
        {
          key: "legalForm",
          path: "legalForm",
          target: "canonical",
          label: "Legal form",
          widget: "text",
          required: false,
          maxLength: 80,
        },
        {
          key: "websiteUrl",
          path: "websiteUrl",
          target: "canonical",
          label: "Website",
          widget: "url",
          required: false,
          maxLength: 2048,
          placeholder: "https://example.com",
        },
        {
          key: "description",
          path: "description",
          target: "canonical",
          label: "Description",
          widget: "textarea",
          required: false,
          maxLength: 2000,
          columnSpan: 12,
        },
      ],
    },
    {
      key: "addresses",
      title: "Addresses",
      description: "Add at least one primary address.",
      fields: [],
      components: [
        {
          key: "addresses",
          kind: "addresses",
          title: "Supplier addresses",
          addLabel: "Add address",
          minItems: 1,
          maxItems: 10,
          requirePrimary: true,
          lookups: { countries: countryOptions, purposes: addressPurposes },
        },
      ],
    },
    {
      key: "contacts",
      title: "Contacts",
      description:
        "Add at least one primary contact and communication channel.",
      fields: [],
      components: [
        {
          key: "contacts",
          kind: "contacts",
          title: "Supplier contacts",
          addLabel: "Add contact",
          minItems: 1,
          maxItems: 10,
          requirePrimary: true,
          lookups: { purposes: contactPurposes, channels: channelOptions },
        },
      ],
    },
  ],
  submitLabel: "Create draft request",
} as const;

export function createBusinessPartnerFoundationDefinition(
  sourceContractHashes: Readonly<
    Record<
      "request" | "eligibility" | "meshProfile" | "meshMatch" | string,
      string
    >
  >,
): BusinessPartnerDefinitionBundleV1 {
  const requestSchemas = {
    "supplier.new": schema("supplier", "new_partner", organizationIdentity, [
      "scope.operatingOrganizationId",
    ]),
    "supplier.add": schema(
      "supplier",
      "add_supplier",
      ["targetBusinessPartnerId"],
      ["scope.operatingOrganizationId"],
    ),
    "supplier.qualify": schema(
      "supplier",
      "qualify",
      [
        "targetBusinessPartnerId",
        "qualification.criteria",
        "qualification.evidence",
      ],
      ["scope.operatingOrganizationId"],
    ),
    "supplier.company": schema(
      "supplier",
      "configure_company",
      ["targetBusinessPartnerId", "company.paymentTerms", "company.currency"],
      ["scope.operatingOrganizationId", "scope.companyCodeId"],
    ),
    "supplier.bank": schema(
      "supplier",
      "change_bank",
      ["targetBusinessPartnerId", "bankVerification.evidenceReference"],
      ["scope.companyCodeId"],
    ),
    "supplier.activate": schema(
      "supplier",
      "activate_supplier",
      ["targetBusinessPartnerId", "activation.businessDate", "activation.readinessEvidence"],
      ["scope.operatingOrganizationId", "scope.companyCodeId"],
    ),
    "customer.new": schema("customer", "new_partner", organizationIdentity, [
      "scope.operatingOrganizationId",
    ]),
    "customer.add": schema(
      "customer",
      "add_customer",
      ["targetBusinessPartnerId"],
      ["scope.operatingOrganizationId"],
    ),
    "customer.credit": schema(
      "customer",
      "credit_review",
      [
        "targetBusinessPartnerId",
        "credit.requestedLimit",
        "credit.currency",
        "credit.evidence",
      ],
      ["scope.companyCodeId"],
    ),
    "customer.company": schema(
      "customer",
      "configure_company",
      [
        "targetBusinessPartnerId",
        "company.paymentTerms",
        "company.statementPolicy",
      ],
      ["scope.operatingOrganizationId", "scope.companyCodeId"],
    ),
    "partner.amend": schema(
      "governance",
      "amend_partner",
      ["targetBusinessPartnerId", "baseRecordVersion"],
      [],
    ),
    "partner.assign": schema(
      "governance",
      "assign_organization",
      ["targetBusinessPartnerId", "scope.operatingOrganizationId"],
      [],
    ),
    "partner.deactivate": schema(
      "governance",
      "deactivate",
      ["targetBusinessPartnerId", "reasonCode"],
      [],
    ),
    "partner.reactivate": schema(
      "governance",
      "reactivate",
      ["targetBusinessPartnerId", "reasonCode"],
      [],
    ),
    "partner.archive": schema(
      "governance",
      "archive",
      ["targetBusinessPartnerId", "reasonCode"],
      [],
    ),
  };
  return Object.freeze({
    schema: BUSINESS_PARTNER_DEFINITION_BUNDLE_SCHEMA_V1,
    bundleCode: "business_partner.onboarding",
    semanticVersion: "3.1.1",
    requestSchemas,
    fieldPolicies: {
      organization: {
        category: "organization",
        visible: [
          ...organizationIdentity,
          "partner.legalForm",
          "partner.incorporationDate",
          "partner.websiteUrl",
          "partner.industryCodes",
        ],
        restricted: ["partner.taxIdentifiers"],
        prohibited: [
          "person.identityEvidence",
          "person.dateOfBirth",
          "employment.compensation",
        ],
      },
      portal: {
        write: [
          ...organizationIdentity,
          "evidence.references",
        ],
        read: ["requestNo", "status", "validationSummary", "returnReasons"],
        prohibited: ["workflow.decision", "readiness.override", "masterData"],
      },
    },
    validationDeclarations: [
      validation(
        "BP_NAME_REQUIRED",
        "partner.name",
        "required",
        "organization",
      ),
      validation(
        "BP_COUNTRY_REQUIRED",
        "partner.countryCode",
        "iso-3166-alpha2",
        "organization",
      ),
      validation(
        "BP_SUPPLIER_SCOPE_REQUIRED",
        "scope.operatingOrganizationId",
        "uuid",
        "supplier",
      ),
      validation(
        "BP_CUSTOMER_SCOPE_REQUIRED",
        "scope.operatingOrganizationId",
        "uuid",
        "customer",
      ),
      validation(
        "BP_EVIDENCE_POLICY_REQUIRED",
        "evidence.references",
        "evidence-policy",
        "all",
      ),
      validation(
        "BP_SOURCE_MAPPING_REQUIRED",
        "source.kind",
        "mapping-declared",
        "all",
      ),
    ],
    duplicateRules: {
      organization: {
        match: [
          "normalizedName+countryCode",
          "registrationNumber+countryCode",
          "taxIdentifierHash+countryCode",
        ],
        resolution: "steward_review",
        categoryChange: "forbidden",
      },
    },
    formDescriptors: {
      request: {
        version: "2.0.0",
        journeyBound: true,
        sections: [
          "identity",
          "role",
          "organizationScope",
          "classification",
          "contacts",
          "evidence",
          "sourceProvenance",
        ],
        conditionalVisibility: [
          { field: "organizationScope", categories: ["organization"] },
          { field: "bankVerification", operations: ["supplier.bank"] },
        ],
      },
      supplierRequest: supplierRequestForm,
      supplierQualification: {
        version: "2.0.0",
        sections: [
          "scope",
          "criteria",
          "commodityRegion",
          "evidence",
          "decision",
        ],
      },
      customerCredit: {
        version: "2.0.0",
        sections: [
          "companyScope",
          "requestedLimit",
          "riskEvidence",
          "decision",
        ],
      },
    },
    viewDescriptors: {
      neonRequestList: {
        version: "2.0.0",
        columns: [
          "requestNo",
          "name",
          "journey",
          "operation",
          "source",
          "status",
          "scope",
          "slaDueAt",
          "createdAt",
        ],
      },
      neonRequestDetail: {
        version: "2.0.0",
        panels: [
          "summary",
          "identity",
          "roleScope",
          "sourceProvenance",
          "validation",
          "duplicates",
          "evidence",
          "workflowTimeline",
          "applicationEvidence",
        ],
      },
      neonReview: {
        version: "2.0.0",
        panels: [
          "reviewedPayload",
          "fieldDiff",
          "validation",
          "duplicateResolution",
          "evidence",
          "readiness",
        ],
        actions: ["return", "reject", "approve"],
        noSelfApproval: true,
      },
      neonPartnerAggregate: {
        version: "2.1.0",
        compatibility: "read_only_until_360_cutover",
        panels: [
          "identity",
          "roles",
          "organizationAssignments",
          "companyConfiguration",
          "qualification",
          "credit",
          "bankVerification",
          "readinessWithoutRisk",
          "sourceProvenance",
        ],
        retirementSignal: "bp360_legacy_aggregate_consumers_zero",
      },
      neonPartner360: {
        version: "1.0.0",
        schemaVersion: 1,
        sections: partner360Sections,
        presentation: {
          identityHeader: "sticky",
          scopeBar: "required_for_scoped_sections",
          navigation: "manifest_driven",
          restrictedValues: "masked_by_default",
        },
        completenessPacks: partner360CompletenessPacks,
        excludedCapabilities: ["risk"],
      },
    },
    mappingContracts: Object.fromEntries(
      sources.map((source) => [
        source,
        {
          version: "2.0.0",
          source,
          destination: "business_partner_request",
          strategy:
            source === "mesh" ? "selective_acceptance" : "declarative_mapping",
          snapshotPinned: source === "mesh",
          directMasterWrite: false,
          allowedJourneys:
            source === "mesh"
              ? ["supplier", "customer"]
              : ["supplier", "customer"],
          requiredProvenance:
            source === "internal"
              ? ["principalId"]
              : source === "portal"
                ? ["invitationId", "applicantPrincipalId"]
                : source === "mesh"
                  ? ["projectionId", "snapshotId", "acceptedFieldPaths"]
                  : ["systemCode", "entityId", "payloadHash"],
        },
      ]),
    ),
    workflowDefinitions: {
      supplier: {
        version: "3.0.1",
        stages: [
          stage("stewardship", "Data stewardship", 240, "serial", "any"),
          {
            ...stage(
              "compliance_tax",
              "Compliance and tax",
              480,
              "parallel",
              "any",
            ),
            when: {
              path: "ownershipClass",
              operator: "not_equals",
              value: "internal",
            },
          },
          stage(
            "procurement_owner",
            "Procurement owner",
            240,
            "parallel",
            "percentage",
            25,
          ),
        ],
        sod: {
          makerCannotDecide: true,
          applicantCannotDecide: true,
          mfaAtDecision: true,
        },
        escalation: [
          "stage_owner",
          "operating_organization_owner",
          "data_governance_owner",
        ],
      },
      customer: {
        version: "3.0.1",
        stages: [
          stage("stewardship", "Data stewardship", 240),
          stage(
            "compliance_consent",
            "Compliance and consent",
            480,
            "parallel",
            "all",
          ),
          stage("sales_owner", "Sales owner", 240),
          stage(
            "credit_review",
            "Credit review",
            480,
            "parallel",
            "percentage",
            50,
          ),
        ],
        sod: {
          makerCannotDecide: true,
          applicantCannotDecide: true,
          mfaAtDecision: true,
        },
        escalation: [
          "stage_owner",
          "sales_organization_owner",
          "data_governance_owner",
        ],
      },
      governance: {
        version: "3.0.1",
        stages: [
          stage(
            "dependency_impact_review",
            "Dependency impact review",
            480,
            "parallel",
            "all",
          ),
          stage("data_stewardship", "Data stewardship", 240),
        ],
        sod: { makerCannotDecide: true, mfaAtDecision: true },
        escalation: ["data_governance_owner"],
      },
    },
    evidencePolicies: {
      supplier: {
        required: ["legal_identity", "tax", "representation"],
        conditional: {
          "supplier.bank": ["bank_ownership", "verification_method"],
          "supplier.qualify": ["qualification_criteria"],
        },
      },
      customer: {
        required: ["legal_identity", "tax_or_consent"],
        conditional: { "customer.credit": ["credit_evidence"] },
      },
    },
    readinessGates: {
      supplier: [
        "BUSINESS_PARTNER_ACTIVE",
        "PROCUREMENT_ASSIGNMENT_EFFECTIVE",
        "COMPANY_PROFILE_COMPLETE",
        "QUALIFICATION_CURRENT",
        "NO_PROHIBITIVE_BLOCK",
        "BANK_VERIFIED_WHEN_PAYABLE",
      ],
      customer: [
        "BUSINESS_PARTNER_ACTIVE",
        "SALES_ASSIGNMENT_EFFECTIVE",
        "COMPANY_PROFILE_COMPLETE",
        "CREDIT_REVIEW_CURRENT",
        "NO_PROHIBITIVE_BLOCK",
      ],
    },
    reasonCodeCatalog: {
      BP_VALIDATION_FAILED: "Payload validation failed",
      BP_DUPLICATE_REVIEW_REQUIRED: "Duplicate review is required",
      BP_EVIDENCE_MISSING: "Required evidence is missing",
      BP_SCOPE_INVALID: "Requested scope is invalid",
      BP_SOD_VIOLATION: "Maker/checker separation failed",
      BP_SLA_ESCALATED: "Workflow SLA was escalated",
      SUPPLIER_NOT_READY: "Supplier readiness gates failed",
      CUSTOMER_NOT_READY: "Customer readiness gates failed",
      BP_DEFINITION_INCOMPATIBLE:
        "Definition is incompatible with the local runtime",
    },
    meshSafeSchemas: {
      organizationProfile: {
        version: "2.0.0",
        schemaVersion: 2,
        fieldSetCode: "recipient_safe_v2",
        category: "organization",
        fields: [
          "schemaCode",
          "schemaVersion",
          "fieldSetCode",
          "authority.plane",
          "authority.ownerTenantId",
          "authority.ownerNetworkAccountId",
          "recipient.tenantId",
          "recipient.networkAccountId",
          "recipient.networkRelationshipId",
          "recipient.proposedNeonRole",
          "partner.accountCode",
          "partner.displayName",
          "partner.legalName",
          "partner.networkRole",
          "partner.countryCode",
          "partner.defaultCurrency",
          "partner.logoAssetRef",
          "partner.legalForm",
          "partner.incorporationDate",
          "partner.websiteUrl",
          "partner.description",
          "partner.preferredLanguageCode",
          "commodityCapabilities.domainCode",
          "commodityCapabilities.code",
          "commodityCapabilities.name",
          "commodityCapabilities.tradeRole",
          "commodityCapabilities.effectiveFrom",
          "commodityCapabilities.effectiveUntil",
          "industryClassifications.domainCode",
          "industryClassifications.code",
          "industryClassifications.name",
          "industryClassifications.assignmentKind",
          "industryClassifications.isPrimary",
          "industryClassifications.confidence",
          "industryClassifications.effectiveFrom",
          "industryClassifications.effectiveUntil",
        ],
        prohibitedPatterns: [
          "person.",
          "workforce.",
          "employment.",
          "bankVerification.",
          "taxIdentifiers.value",
        ],
      },
      selectiveAcceptance: {
        version: "2.0.0",
        requires: ["snapshotId", "acceptedFieldPaths", "payloadHash"],
        directMasterWrite: false,
      },
    },
    compatibilityRules: {
      bundleSchemaVersion: "1.0.0",
      minimumConsumerVersions: {
        studio: "1.0.0",
        neon: "1.0.0",
        mesh: "1.0.0",
      },
      unknownFieldPolicy: "reject_for_policy_objects",
      removedRequiredField: "breaking",
      addOptionalField: "backward_compatible",
      workflowStageRemoval: "breaking",
      mappingChangeRequiresNewVersion: true,
      semanticVersionMonotonic: true,
      sourceHashExact: true,
      lastValidLocalReleaseOnStudioOutage: true,
      rollbackOnlyToExactPreviousActive: true,
    },
    sourceContractHashes,
  });
}
function schema(
  role: string,
  operation: string,
  required: readonly string[],
  scope: readonly string[],
) {
  return {
    version: "2.0.0",
    role,
    operation,
    supportedSources: sources,
    required: [...required, ...scope],
    additionalProperties: false,
    definitionDriven: true,
  };
}
function validation(
  code: string,
  path: string,
  rule: string,
  appliesTo: string,
) {
  return { code, path, rule, appliesTo, severity: "error" };
}
function stage(
  code: string,
  name: string,
  slaMinutes: number,
  mode: "serial" | "parallel" = "serial",
  quorum: "any" | "all" | "percentage" = "any",
  value?: number,
) {
  return {
    code,
    name,
    mode,
    quorum: { kind: quorum, ...(value !== undefined ? { value } : {}) },
    slaMinutes,
    remindersAtMinutes: [
      Math.floor(slaMinutes / 2),
      Math.floor(slaMinutes * 0.8),
    ],
    escalateAtMinutes: slaMinutes,
    noSelfApproval: true,
  };
}

const partner360Sections = Object.freeze([
  {
    code: "overview",
    routes: [],
    permission: "neon.relationship.business_partner.read",
    discoverableWhenDenied: false,
  },
  {
    code: "identity",
    routes: ["/api/neon/business-partners/:id/360/identity"],
    permission: "neon.relationship.business_partner_identity.read",
    discoverableWhenDenied: false,
  },
  {
    code: "contacts",
    routes: ["/api/neon/business-partners/:id/360/contacts"],
    permission: "neon.relationship.business_partner_contact.read",
    discoverableWhenDenied: false,
  },
  {
    code: "addresses",
    routes: ["/api/neon/business-partners/:id/360/addresses"],
    permission: "neon.relationship.business_partner_address.read",
    discoverableWhenDenied: false,
  },
  {
    code: "identifiers-tax",
    routes: ["/api/neon/business-partners/:id/360/identifiers"],
    permission: "neon.relationship.business_partner_identifier.read_masked",
    fieldPermissions: ["neon.relationship.business_partner_tax.read_masked"],
    discoverableWhenDenied: false,
  },
  {
    code: "roles-scope",
    routes: ["/api/neon/business-partners/:id/360/roles"],
    permission: "neon.relationship.business_partner.read",
    discoverableWhenDenied: false,
  },
  {
    code: "supplier-company",
    routes: ["/api/neon/business-partners/:id/360/company-configuration"],
    permission: "neon.relationship.business_partner.read",
    discoverableWhenDenied: false,
  },
  {
    code: "customer-company",
    routes: ["/api/neon/business-partners/:id/360/company-configuration"],
    permission: "neon.relationship.business_partner.read",
    discoverableWhenDenied: false,
  },
  {
    code: "banking",
    routes: ["/api/neon/business-partners/:id/360/banking"],
    permission: "neon.relationship.business_partner_bank.read_masked",
    discoverableWhenDenied: false,
  },
  {
    code: "qualifications-certificates",
    routes: [
      "/api/neon/business-partners/:id/360/qualifications",
      "/api/neon/business-partners/:id/360/certificates",
    ],
    permission: "neon.relationship.business_partner_qualification.read",
    fieldPermissions: ["neon.relationship.business_partner_certificate.read"],
    discoverableWhenDenied: false,
  },
  {
    code: "credit",
    routes: ["/api/neon/business-partners/:id/360/credit"],
    permission: "neon.relationship.business_partner_credit.read",
    discoverableWhenDenied: false,
  },
  {
    code: "requests",
    routes: ["/api/neon/business-partners/:id/360/requests"],
    permission: "neon.relationship.entity_case.read",
    discoverableWhenDenied: false,
  },
  {
    code: "activity",
    routes: ["/api/neon/business-partners/:id/360/activity"],
    permission: "neon.relationship.business_partner_activity.read",
    discoverableWhenDenied: false,
  },
  {
    code: "business-activity",
    routes: ["/api/neon/business-partners/:id/360/business-activity"],
    permission: "neon.relationship.business_partner.read",
    discoverableWhenDenied: false,
  },
  {
    code: "network",
    routes: ["/api/neon/business-partners/:id/360/network"],
    permission: "neon.relationship.business_partner_network.read",
    discoverableWhenDenied: false,
  },
]);

const requirement = (
  code: string,
  fieldCode: string,
  sectionCode: string,
  severity: "required" | "recommended",
  actionCode: string,
  label: string,
  requiresVerified = false,
) => ({
  code,
  fieldCode,
  sectionCode,
  severity,
  actionCode,
  label,
  ...(requiresVerified ? { requiresVerified: true } : {}),
});
const partner360CompletenessPacks = Object.freeze([
  {
    code: "organization_base",
    version: 1,
    category: "organization",
    scope: "global",
    requirements: [
      requirement(
        "organization.legal_name",
        "partner.name",
        "identity",
        "required",
        "amend_partner",
        "Add legal name",
      ),
      requirement(
        "organization.lifecycle",
        "partner.lifecycleStatus",
        "identity",
        "required",
        "lifecycle",
        "Review lifecycle",
      ),
      requirement(
        "organization.primary_address",
        "address.primary",
        "addresses",
        "required",
        "amend_partner",
        "Add primary address",
        true,
      ),
      requirement(
        "organization.primary_contact",
        "contact.primary",
        "contacts",
        "recommended",
        "amend_partner",
        "Add primary contact",
        true,
      ),
      requirement(
        "organization.identifier",
        "identifier.primary",
        "identifiers-tax",
        "recommended",
        "amend_partner",
        "Add verified identifier",
        true,
      ),
      requirement(
        "organization.commercial_role",
        "role.any_commercial",
        "roles-scope",
        "recommended",
        "add_role",
        "Add supplier or customer role",
      ),
    ],
  },
  {
    code: "supplier_scope",
    version: 1,
    category: "organization",
    role: "supplier",
    scope: "organization",
    requirements: [
      requirement(
        "supplier.role",
        "role.supplier",
        "roles-scope",
        "required",
        "add_role",
        "Add supplier role",
      ),
      requirement(
        "supplier.organization",
        "scope.supplier.organization",
        "roles-scope",
        "required",
        "assign_organization",
        "Assign procurement organization",
      ),
    ],
  },
  {
    code: "supplier_payable",
    version: 1,
    category: "organization",
    role: "supplier",
    scope: "company",
    requirements: [
      requirement(
        "supplier.company",
        "company.supplier.profile",
        "supplier-company",
        "required",
        "configure_company",
        "Configure supplier company",
      ),
      requirement(
        "supplier.bank",
        "bank.verified_presence",
        "banking",
        "required",
        "change_bank",
        "Verify bank account",
        true,
      ),
      requirement(
        "supplier.qualification",
        "qualification.current",
        "qualifications-certificates",
        "recommended",
        "qualification",
        "Start qualification",
        true,
      ),
      requirement(
        "supplier.certificate",
        "certification.current",
        "qualifications-certificates",
        "recommended",
        "certification",
        "Add certification",
        true,
      ),
    ],
  },
  {
    code: "customer_scope",
    version: 1,
    category: "organization",
    role: "customer",
    scope: "organization",
    requirements: [
      requirement(
        "customer.role",
        "role.customer",
        "roles-scope",
        "required",
        "add_role",
        "Add customer role",
      ),
      requirement(
        "customer.organization",
        "scope.customer.organization",
        "roles-scope",
        "required",
        "assign_organization",
        "Assign sales organization",
      ),
    ],
  },
  {
    code: "customer_credit",
    version: 1,
    category: "organization",
    role: "customer",
    scope: "company",
    requirements: [
      requirement(
        "customer.company",
        "company.customer.profile",
        "customer-company",
        "required",
        "configure_company",
        "Configure customer company",
      ),
      requirement(
        "customer.credit",
        "credit.current",
        "credit",
        "recommended",
        "configure_company",
        "Open credit review",
        true,
      ),
    ],
  },

]);
