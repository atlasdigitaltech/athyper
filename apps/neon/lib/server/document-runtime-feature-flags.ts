import "server-only";

import { resolveNextRolloutStageFromEnv } from "@/lib/server/document-open-rollout-automation";
import { getOpenRolloutGuardDecision } from "@/lib/server/document-open-rollout-guard";

export const documentRuntimeFeatureFlags = {
  fieldOptionsCsrfV2: readFlag("DOCUMENT_FIELD_OPTIONS_CSRF_V2", true),
  fieldOptionsServiceV2: readFlag("DOCUMENT_FIELD_OPTIONS_SERVICE_V2", false),
  openRulesBootstrap: readFlag("DOCUMENT_OPEN_RULES_BOOTSTRAP", false),
  openChildMetadataBootstrap: readFlag("DOCUMENT_OPEN_CHILD_METADATA_BOOTSTRAP", false),
  openDescriptorCacheV2: readFlag("DOCUMENT_OPEN_DESCRIPTOR_CACHE_V2", false),
} as const;

export type DocumentOpenRolloutStage =
  | "off"
  | "rules_internal"
  | "child_internal"
  | "descriptor_5"
  | "descriptor_25"
  | "full";

export interface DocumentOpenRollout {
  stage: DocumentOpenRolloutStage;
  cohort: "control" | "internal" | "canary" | "full";
  bucket: number;
  openRulesBootstrap: boolean;
  openChildMetadataBootstrap: boolean;
  openDescriptorCacheV2: boolean;
  /** Compare legacy/new projections before serving during internal/canary stages. */
  shadowRuntimeBootstrap?: boolean;
  guard: {
    disabled: boolean;
    reason: string | null;
    disabledUntil: number;
  };
}

interface DocumentOpenRolloutInput {
  session: {
    activeOrg?: string | null;
    organizations?: Record<string, { tenantId?: string; tenantCode?: string }>;
  };
  entityCode: string;
}

/**
 * Returns one stable rollout stage per request unless an explicit rollout
 * automation override is supplied.
 */
export function resolveDocumentOpenRollout(input: DocumentOpenRolloutInput): DocumentOpenRollout {
  const guard = getOpenRolloutGuardDecision();
  const guardDisabled = guard.disabled;
  const configuredStage = readOpenRolloutStage();
  const autoStage = resolveNextRolloutStageFromEnv(configuredStage);
  const stage = autoStage ?? configuredStage;
  const activeOrganization = input.session.activeOrg
    ? input.session.organizations?.[input.session.activeOrg]
    : undefined;
  const tenantKey = activeOrganization?.tenantId
    ?? activeOrganization?.tenantCode
    ?? input.session.activeOrg
    ?? "unknown";
  const internalTenants = new Set(
    (process.env.DOCUMENT_OPEN_INTERNAL_TENANTS ?? "athyper")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  const isInternal = [tenantKey, activeOrganization?.tenantId, activeOrganization?.tenantCode]
    .some((value) => value ? internalTenants.has(value.toLowerCase()) : false);
  const bucket = stableRolloutBucket(`${tenantKey}:${input.entityCode}`);
  const descriptorPercentage = stage === "descriptor_5" ? 5 : stage === "descriptor_25" ? 25 : 0;
  const isDescriptorCanary = descriptorPercentage > 0 && bucket < descriptorPercentage;

  const stagedRules = stage !== "off" && (
    isInternal || stage === "descriptor_5" || stage === "descriptor_25" || stage === "full"
  );
  const stagedChildMetadata = stage !== "off" && stage !== "rules_internal" && (
    isInternal || stage === "descriptor_5" || stage === "descriptor_25" || stage === "full"
  );
  const stagedDescriptorCache = (stage === "child_internal" && isInternal) || stage === "full" || (
    (stage === "descriptor_5" || stage === "descriptor_25") && (isInternal || isDescriptorCanary)
  );
  const openRulesBootstrap = readOptionalFlag("DOCUMENT_OPEN_RULES_BOOTSTRAP") ?? stagedRules;
  const openChildMetadataBootstrap = readOptionalFlag("DOCUMENT_OPEN_CHILD_METADATA_BOOTSTRAP")
    ?? stagedChildMetadata;
  const openDescriptorCacheV2 = readOptionalFlag("DOCUMENT_OPEN_DESCRIPTOR_CACHE_V2")
    ?? stagedDescriptorCache;
  const shadowRuntimeBootstrap = openDescriptorCacheV2 && stage !== "full";

  return {
    stage: guardDisabled ? "off" : stage,
    cohort: guardDisabled
      ? "control"
      : stage === "full"
        ? "full"
        : isInternal
          ? "internal"
          : isDescriptorCanary
            ? "canary"
            : "control",
    bucket,
    openRulesBootstrap: guardDisabled ? false : openRulesBootstrap,
    openChildMetadataBootstrap: guardDisabled ? false : openChildMetadataBootstrap,
    openDescriptorCacheV2: guardDisabled ? false : openDescriptorCacheV2,
    shadowRuntimeBootstrap: guardDisabled ? false : shadowRuntimeBootstrap,
    guard: {
      disabled: guardDisabled,
      reason: guard.reason,
      disabledUntil: guard.disabledUntil,
    },
  };
}

export function parseDocumentOpenRolloutStage(value?: string): DocumentOpenRolloutStage | null {
  if (value === "off"
    || value === "rules_internal"
    || value === "child_internal"
    || value === "descriptor_5"
    || value === "descriptor_25"
    || value === "full") {
    return value;
  }
  return null;
}

function readFlag(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "on", "yes"].includes(value)) return true;
  if (["0", "false", "off", "no"].includes(value)) return false;
  return fallback;
}

function readOptionalFlag(name: string): boolean | undefined {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return undefined;
  if (["1", "true", "on", "yes"].includes(value)) return true;
  if (["0", "false", "off", "no"].includes(value)) return false;
  return undefined;
}

function readOpenRolloutStage(): DocumentOpenRolloutStage {
  const value = process.env.DOCUMENT_OPEN_ROLLOUT_STAGE?.trim().toLowerCase();
  const parsed = parseDocumentOpenRolloutStage(value);
  if (parsed) return parsed;
  // Descriptor V2 is the production default. Operators retain the explicit
  // stage and individual flag kill switches for controlled rollback.
  return "full";
}

export function stableRolloutBucket(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}
