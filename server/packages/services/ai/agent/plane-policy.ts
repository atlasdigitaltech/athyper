/**
 * Server-authoritative Atlas plane admission.
 *
 * This policy is deliberately independent from browser plane profiles. The
 * authenticated route and exact model catalog share this resolver so a client
 * cannot widen model, persistence, tool, or mutation eligibility.
 */

import type { AtlasPlane } from "@athyper/atlas-agent-runtime";
import type { AtlasModelBinding } from "../providers/i-model-provider.js";
import type {
  AtlasBindingPolicyEvaluator,
  AtlasBindingPolicySnapshot,
  CatalogSession,
} from "./model-catalog.js";

export const ATLAS_AGENT_GLOBAL_FLAG = "atlas_agent_enabled";
export const ATLAS_AGENT_PLANE_FLAGS = Object.freeze({
  neon: "atlas_agent_neon_enabled",
  mesh: "atlas_agent_mesh_enabled",
  admin: "atlas_agent_admin_enabled",
} satisfies Record<AtlasPlane, string>);

export const ATLAS_PHASE0_PLANE_POLICY_VERSION =
  "atlas-plane-admission-admin-product-help-v2";

const PHASE0_ALLOWED_PUBLIC_MODELS = Object.freeze([
  "atlas-fast",
  "atlas-balanced",
  "atlas-best",
  "atlas-openai-eval",
  "atlas-gemini-eval",
] as const);

export interface AtlasPlaneAdmissionDecision {
  readonly plane: AtlasPlane | "unknown";
  readonly chatAllowed: boolean;
  readonly persistenceAllowed: boolean;
  readonly readToolsAllowed: boolean;
  readonly mutationsAllowed: boolean;
  readonly allowedPublicModelIds: readonly string[];
  readonly policyRevision: string;
  readonly reasonCode?:
    | "global_feature_disabled"
    | "plane_feature_disabled"
    | "plane_not_enabled"
    | "plane_not_supported";
}

export interface AtlasPlanePolicyFeatureFlags {
  isEnabled(code: string, tenantId?: string): Promise<boolean>;
}

export interface AtlasPlanePolicyResolver {
  resolve(session: CatalogSession): Promise<AtlasPlaneAdmissionDecision>;
  resolveBindingPolicy(
    session: CatalogSession,
  ): Promise<AtlasBindingPolicySnapshot>;
}

export interface AtlasPlanePolicyResolverOptions {
  featureFlags: AtlasPlanePolicyFeatureFlags;
  evaluateBinding: AtlasBindingPolicyEvaluator;
}

interface Phase0PlaneProfile {
  readonly chat: boolean;
  readonly persistence: boolean;
  readonly readTools: boolean;
  readonly mutations: boolean;
  readonly allowedPublicModelIds: readonly string[];
}

type Phase0AtlasPlane = "neon" | "mesh" | "admin";

/**
 * Neon chat and Admin product-help chat are independently allowlisted. Mesh,
 * persistence, read tools, and mutations stay structurally represented but
 * fail closed.
 */
export const ATLAS_PHASE0_PLANE_MATRIX = Object.freeze({
  neon: Object.freeze({
    chat: true,
    persistence: false,
    readTools: false,
    mutations: false,
    allowedPublicModelIds: PHASE0_ALLOWED_PUBLIC_MODELS,
  }),
  mesh: Object.freeze({
    chat: false,
    persistence: false,
    readTools: false,
    mutations: false,
    allowedPublicModelIds: Object.freeze([]),
  }),
  admin: Object.freeze({
    chat: true,
    persistence: false,
    readTools: false,
    mutations: false,
    // Admin starts with the lowest-cost product-help mode only. Evaluation
    // and premium/provider-specific modes are not part of the first pilot.
    allowedPublicModelIds: Object.freeze(["atlas-fast"]),
  }),
} satisfies Record<AtlasPlane, Phase0PlaneProfile>);

export function createPhase0AtlasPlanePolicyResolver(
  options: AtlasPlanePolicyResolverOptions,
): AtlasPlanePolicyResolver {
  const resolve = async (
    session: CatalogSession,
  ): Promise<AtlasPlaneAdmissionDecision> => {
    const plane = asAtlasPlane(session.plane);
    if (!plane) {
      return disabledDecision("unknown", "plane_not_supported");
    }

    const profile = ATLAS_PHASE0_PLANE_MATRIX[plane];
    const globalEnabled = await options.featureFlags.isEnabled(
      ATLAS_AGENT_GLOBAL_FLAG,
      session.tenantId,
    );
    const planeEnabled = globalEnabled
      && await options.featureFlags.isEnabled(
        ATLAS_AGENT_PLANE_FLAGS[plane],
        session.tenantId,
      );
    const chatAllowed = globalEnabled && planeEnabled && profile.chat;
    const reasonCode = !globalEnabled
      ? "global_feature_disabled"
      : !planeEnabled
        ? "plane_feature_disabled"
        : !profile.chat
          ? "plane_not_enabled"
          : undefined;
    const policyRevision = decisionRevision({
      plane,
      globalEnabled,
      planeEnabled,
      profile,
    });

    return Object.freeze({
      plane,
      chatAllowed,
      persistenceAllowed: chatAllowed && profile.persistence,
      readToolsAllowed: chatAllowed && profile.readTools,
      mutationsAllowed: chatAllowed && profile.mutations,
      allowedPublicModelIds: chatAllowed
        ? profile.allowedPublicModelIds
        : Object.freeze([]),
      policyRevision,
      ...(reasonCode ? { reasonCode } : {}),
    });
  };

  return {
    resolve,
    resolveBindingPolicy: async (session) => {
      const admission = await resolve(session);
      return {
        revision: admission.policyRevision,
        evaluatePolicy: async (
          binding: AtlasModelBinding,
          evaluatedSession: CatalogSession,
        ) => {
          if (!samePolicyScope(session, evaluatedSession)) {
            return { allowed: false, reason: "plane_policy_scope_mismatch" };
          }
          if (!admission.chatAllowed) {
            return {
              allowed: false,
              reason: admission.reasonCode ?? "plane_not_enabled",
            };
          }
          if (
            !admission.allowedPublicModelIds.includes(binding.publicModelId)
          ) {
            return { allowed: false, reason: "model_not_allowed_for_plane" };
          }
          return options.evaluateBinding(binding, evaluatedSession);
        },
      };
    },
  };
}

function disabledDecision(
  plane: "unknown",
  reasonCode: "plane_not_supported",
): AtlasPlaneAdmissionDecision {
  return Object.freeze({
    plane,
    chatAllowed: false,
    persistenceAllowed: false,
    readToolsAllowed: false,
    mutationsAllowed: false,
    allowedPublicModelIds: Object.freeze([]),
    policyRevision:
      `${ATLAS_PHASE0_PLANE_POLICY_VERSION}:${plane}:disabled`,
    reasonCode,
  });
}

function decisionRevision(input: {
  plane: AtlasPlane;
  globalEnabled: boolean;
  planeEnabled: boolean;
  profile: Phase0PlaneProfile;
}): string {
  const bit = (value: boolean) => value ? "1" : "0";
  return [
    ATLAS_PHASE0_PLANE_POLICY_VERSION,
    input.plane,
    `global=${bit(input.globalEnabled)}`,
    `rollout=${bit(input.planeEnabled)}`,
    `chat=${bit(input.profile.chat)}`,
    `persistence=${bit(input.profile.persistence)}`,
    `read=${bit(input.profile.readTools)}`,
    `mutate=${bit(input.profile.mutations)}`,
  ].join(":");
}

function samePolicyScope(
  expected: CatalogSession,
  actual: CatalogSession,
): boolean {
  return expected.tenantId === actual.tenantId
    && expected.principalId === actual.principalId
    && expected.plane === actual.plane
    && expected.verifiedRequestContext === actual.verifiedRequestContext;
}

function asAtlasPlane(value: string): Phase0AtlasPlane | null {
  return value === "neon" || value === "mesh" || value === "admin"
    ? value
    : null;
}
