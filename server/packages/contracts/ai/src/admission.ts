import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { AtlasDataClass, AtlasModelBinding, AtlasPublicModelId } from "./model.js";

export interface AtlasPlaneAdmissionDecision {
  readonly schema: "atlas-plane-admission/1";
  readonly planeKey: VerifiedRequestContext["planeKey"];
  readonly chatAllowed: boolean;
  readonly persistenceAllowed: boolean;
  readonly readToolsAllowed: boolean;
  readonly mutationToolsAllowed: boolean;
  readonly invoiceExtractionAllowed: boolean;
  readonly allowedPublicModelIds: readonly AtlasPublicModelId[];
  readonly allowedDataClasses: readonly AtlasDataClass[];
  readonly policyRevision: string;
  readonly reasonCode?: string;
}

export interface AtlasPlaneAdmissionResolver {
  resolve(context: VerifiedRequestContext): Promise<AtlasPlaneAdmissionDecision>;
}

export interface AtlasModelPolicyDecision {
  readonly allowed: boolean;
  readonly policyRevision: string;
  readonly promptRevision: string;
  readonly reasonCode?: string;
}

export interface AtlasModelPolicyResolver {
  evaluate(input: { readonly context: VerifiedRequestContext; readonly admission: AtlasPlaneAdmissionDecision; readonly binding: AtlasModelBinding; readonly dataClass: AtlasDataClass }): Promise<AtlasModelPolicyDecision>;
}
