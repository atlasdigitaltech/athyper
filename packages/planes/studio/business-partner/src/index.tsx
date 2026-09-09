export const businessPartnerDefinition = Object.freeze({
  workspace: "MDG",
  module: "Business Partner",
  publicationKey: "studio.business_partner.definition.business_partner.onboarding",
});

export * from "./operations";
export * from "./authoring";
export * from "./supplier-request-form-designer";
export * from "./workflow-designer";

export { BusinessPartnerCaseContractAuthoring } from "./case-contract-authoring";
export { BankDirectoryWorkspace } from "./bank-directory";
