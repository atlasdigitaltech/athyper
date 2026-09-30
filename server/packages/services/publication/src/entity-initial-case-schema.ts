// Initial case schema candidate. Historical content is schema provenance, not publication approval.
export const businessPartnerInitialCaseSchema = {
  type: "object",
  // Drafts may omit business fields; intake submission enforces published field requirements.
    required: ["businessPartnerCode"],
  additionalProperties: false,
  properties: {
    businessPartnerCode: {
      type: "string",
      minLength: 1,
    },
    name: {
      type: "string",
      minLength: 1,
      maxLength: 320,
    },
    legalForm: {
      type: "string",
    },
    registrationCountryCode: {
      type: "string",
    },
    incorporationDate: {
      type: "string",
    },
    websiteUrl: {
      type: "string",
    },
    description: {
      type: "string",
    },
    ownershipClass: {
      type: "string",
      enum: ["internal", "external"],
    },
    requestedRole: {
      type: "string",
      enum: ["supplier", "customer"],
    },
    roleCode: {
      type: "string",
    },
    registrationChannel: {
      type: "string",
    },
    operatingOrganizationId: {
      type: "string",
    },
    meshRegistrationExchangeId: {
      type: "string",
    },
    meshRegistrationEvidenceHash: {
      type: "string",
    },
    bankDisclosureReceiptId: {
      type: "string",
    },
    bankDisclosurePurposeCode: {
      type: "string",
    },
    qualificationTypeCode: {
      type: "string",
    },
    preferenceRationale: {
      type: "string",
    },
    companyCodeId: {
      type: "string",
    },
    commodityCategoryId: {
      type: "string",
    },
    preflight: {
      type: "object",
    },
    expectedBusinessPartnerVersion: {
      type: "integer",
      minimum: 1,
    },
    priorStatus: {
      type: "string",
    },
    reasonCode: {
      type: "string",
    },
    dependencies: {
      type: "array",
    },
    bankProjectionId: {
      type: "string",
    },
    supplierCompanyProfileId: {
      type: "string",
    },
    expectedBankSnapshotId: {
      type: "string",
    },
    priorBankLinkId: {
      type: "string",
    },
  },
} as const;
