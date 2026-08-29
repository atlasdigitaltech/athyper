import { BUSINESS_PARTNER_DEFINITION_BUNDLE_SCHEMA_V1,type BusinessPartnerDefinitionBundleV1 } from "@athyper/server-contract-publication";

export function createBusinessPartnerFoundationDefinition(sourceContractHashes:Readonly<Record<"request"|"eligibility"|"meshProfile"|"meshMatch",string>>):BusinessPartnerDefinitionBundleV1{
  return Object.freeze({
    schema:BUSINESS_PARTNER_DEFINITION_BUNDLE_SCHEMA_V1,
    bundleCode:"business_partner.onboarding",
    semanticVersion:"1.0.0",
    requestSchemas:{
      internal:{version:"1.0.0",sourceMode:"internal",required:["partner.displayName","partner.legalName","partner.countryCode","scope.operatingOrganizationId"]},
      mesh:{version:"1.0.0",sourceMode:"mesh",required:["sourceProjectionId","sourceSnapshotId","acceptedFieldPaths","scope.operatingOrganizationId"],pinnedSnapshotRequired:true},
    },
    validationDeclarations:[
      {code:"BP_LEGAL_NAME_REQUIRED",path:"partner.legalName",rule:"required",severity:"error"},
      {code:"BP_COUNTRY_REQUIRED",path:"partner.countryCode",rule:"iso-3166-alpha2",severity:"error"},
      {code:"BP_DUPLICATE_REVIEW_REQUIRED",rule:"candidate-match-reviewed",severity:"error"},
      {code:"BP_SUPPLIER_SCOPE_REQUIRED",rule:"operating-organization-required",when:{partnerRoles:{contains:"supplier"}},severity:"error"},
    ],
    formDescriptors:{
      onboarding:{version:"1.0.0",sections:["identity","classification","organizationScope","sourceEvidence","contacts"],conditionalVisibility:[{field:"sourceEvidence",when:{sourceMode:"mesh"}},{field:"supplierClassification",when:{partnerRoles:{contains:"supplier"}}}]},
      qualification:{version:"1.0.0",sections:["scope","criteria","evidence","decision"]},
    },
    viewDescriptors:{
      requestList:{version:"1.0.0",columns:["requestNo","displayName","sourceMode","status","operatingOrganization","createdAt"]},
      requestDetail:{version:"1.0.0",panels:["summary","partnerData","sourceProvenance","validationEvidence","workflowTimeline"]},
      partnerAggregate:{version:"1.0.0",panels:["identity","roles","organizationAssignments","qualification","preferences","sourceProvenance"]},
    },
    mappingContracts:{
      meshToRequest:{version:"1.0.0",strategy:"selective_acceptance",mappings:{"partner.accountCode":"partner.accountCode","partner.displayName":"partner.displayName","partner.legalName":"partner.legalName","partner.legalForm":"partner.legalForm","partner.countryCode":"partner.countryCode","partner.incorporationDate":"partner.incorporationDate","partner.websiteUrl":"partner.websiteUrl","partner.description":"partner.description"},directMasterWrite:false},
      requestToMaster:{version:"1.0.0",trigger:"approved",creates:["businessPartner","initialRole","operatingOrganizationAssignment"],directStudioWrite:false},
    },
    workflowDefinitions:{
      onboarding:{version:"1.0.0",initialState:"draft",transitions:["draft:submitted","submitted:returned","returned:submitted","submitted:rejected","submitted:approved"],controls:{noSelfApproval:true,approvalMfa:true,decisionFingerprint:true}},
      qualification:{version:"1.0.0",states:["not_started","in_review","qualified","not_qualified","expired"]},
      preferredSupplier:{version:"1.0.0",states:["proposed","approved","expired","withdrawn"],effectiveDated:true},
      riskAssessmentHook:{version:"0.1.0",enabled:false,states:["not_assessed","pending","assessed","expired"]},
    },
    compatibilityRules:{unknownFieldPolicy:"ignore",removedRequiredField:"breaking",addOptionalField:"backward_compatible",workflowTransitionRemoval:"breaking",mappingChangeRequiresNewVersion:true,lastValidLocalReleaseOnStudioOutage:true},
    sourceContractHashes,
  });
}
