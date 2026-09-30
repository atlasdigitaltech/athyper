import type { AtlasPlaneAdmissionDecision, AtlasPlaneAdmissionResolver, AtlasPublicModelId } from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { assertAtlasContext, hasPermission } from "./context.js";

export interface AtlasFeatureFlags {
  isEnabled(input: { readonly tenantId: string; readonly key: string; readonly strict: boolean }): Promise<boolean>;
}
export interface AtlasPlaneCapabilityProfile {
  readonly chat: boolean;
  readonly persistence: boolean;
  readonly readTools: boolean;
  readonly mutationTools: boolean;
  readonly invoiceExtraction: boolean;
  readonly allowedPublicModelIds: readonly AtlasPublicModelId[];
  readonly allowedDataClasses: AtlasPlaneAdmissionDecision["allowedDataClasses"];
}
export interface AtlasAdmissionOptions {
  readonly featureFlags: AtlasFeatureFlags;
  readonly policyVersion: string;
  readonly profiles: Readonly<Record<VerifiedRequestContext["planeKey"], AtlasPlaneCapabilityProfile>>;
}

export function createAtlasPlaneAdmissionResolver(options: AtlasAdmissionOptions): AtlasPlaneAdmissionResolver {
  return {
    async resolve(context) {
      assertAtlasContext(context);
      const permission = `${context.planeKey}.ai.agent.use`;
      const profile = options.profiles[context.planeKey];
      const global = await options.featureFlags.isEnabled({ tenantId: context.tenantId, key: "atlas_agent_enabled", strict: true });
      const plane = global && await options.featureFlags.isEnabled({ tenantId: context.tenantId, key: `atlas_agent_${context.planeKey}_enabled`, strict: true });
      const permitted = hasPermission(context, permission);
      const chatAllowed = global && plane && permitted && profile.chat;
      const reasonCode = !global ? "global_feature_disabled" : !plane ? "plane_feature_disabled" : !permitted ? "permission_denied" : !profile.chat ? "plane_not_admitted" : undefined;
      return Object.freeze({
        schema: "atlas-plane-admission/1",
        planeKey: context.planeKey,
        chatAllowed,
        persistenceAllowed: chatAllowed && profile.persistence,
        readToolsAllowed: chatAllowed && profile.readTools,
        mutationToolsAllowed: chatAllowed && profile.mutationTools,
        invoiceExtractionAllowed: chatAllowed && profile.invoiceExtraction,
        allowedPublicModelIds: chatAllowed ? Object.freeze([...profile.allowedPublicModelIds]) : Object.freeze([]),
        allowedDataClasses: chatAllowed ? Object.freeze([...profile.allowedDataClasses]) : Object.freeze([]),
        policyRevision: [options.policyVersion, context.planeKey, Number(global), Number(plane), Number(permitted), Number(profile.chat), Number(profile.persistence), Number(profile.readTools), Number(profile.mutationTools), Number(profile.invoiceExtraction)].join(":"),
        ...(reasonCode ? { reasonCode } : {}),
      });
    },
  };
}
