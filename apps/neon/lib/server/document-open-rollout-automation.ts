import type { DocumentOpenProgressSnapshot, DocumentOpenRolloutDecision } from "@/lib/server/document-open-rollout-gates";
import { resolveNextDocumentOpenRolloutStage } from "@/lib/server/document-open-rollout-gates";
import type { DocumentOpenRolloutStage } from "@/lib/server/document-runtime-feature-flags";

type RolloutSnapshotEnv = {
  minimumSamples?: number;
  metrics: Record<string, number>;
};

export function readDocumentOpenRolloutSnapshotFromEnv(): DocumentOpenProgressSnapshot | null {
  const raw = process.env.DOCUMENT_OPEN_ROLLOUT_PROGRESS_SNAPSHOT;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as RolloutSnapshot;
    if (!isRecord(parsed)) return null;
    const metrics = sanitizeMetrics(parsed.metrics);
    if (Object.keys(metrics).length === 0) return null;
    return {
      metrics,
      minimumSamples: normalizeNumber(parsed.minimumSamples),
    };
  } catch {
    return null;
  }
}

export function resolveDocumentOpenRolloutDecisionFromSnapshot(
  currentStage: string,
  snapshotInput: RolloutSnapshotEnv,
): { nextStage: DocumentOpenRolloutStage; decision: DocumentOpenRolloutDecision } | null {
  if (!isRolloutStage(currentStage)) return null;
  const snapshot = sanitizeSnapshot(snapshotInput);
  if (!snapshot) return null;
  const decision = resolveNextDocumentOpenRolloutStage(currentStage, snapshot);
  return {
    nextStage: decision.nextStage,
    decision: {
      ...decision,
      action: decision.action,
      reasons: [...decision.reasons],
    },
  };
}

export function resolveDocumentOpenRolloutStageFromSnapshot(
  currentStage: string,
  snapshotInput: RolloutSnapshotEnv,
): { nextStage: DocumentOpenRolloutStage; decision: DocumentOpenRolloutDecision } | null {
  const snapshot = sanitizeSnapshot(snapshotInput);
  if (!snapshot || !isRolloutStage(currentStage)) return null;
  const decision = resolveNextDocumentOpenRolloutStage(currentStage, snapshot);
  return {
    nextStage: decision.nextStage,
    decision,
  };
}

export function resolveNextRolloutStageFromEnv(currentStage: string): DocumentOpenRolloutStage | null {
  if (!isRolloutStage(currentStage)) return null;
  if (!readBoolean(process.env.DOCUMENT_OPEN_ROLLOUT_AUTO)) return null;

  const snapshot = readDocumentOpenRolloutSnapshotFromEnv();
  if (!snapshot) return null;

  const decision = resolveNextDocumentOpenRolloutStage(currentStage, snapshot);
  if (decision.action === "advance") return decision.nextStage;
  if (decision.action === "rollback") return rollbackRolloutStage(currentStage);
  return null;
}

function rollbackRolloutStage(currentStage: DocumentOpenRolloutStage): DocumentOpenRolloutStage {
  const rollbackStages: Record<DocumentOpenRolloutStage, DocumentOpenRolloutStage> = {
    off: "off",
    rules_internal: "off",
    child_internal: "rules_internal",
    descriptor_5: "child_internal",
    descriptor_25: "child_internal",
    full: "descriptor_25",
  };
  return rollbackStages[currentStage];
}

function sanitizeSnapshot(input: RolloutSnapshotEnv | null | undefined): DocumentOpenProgressSnapshot | null {
  if (!input || !isRecord(input)) return null;
  const metrics = sanitizeMetrics(input.metrics);
  if (Object.keys(metrics).length === 0) return null;
  return {
    metrics,
    minimumSamples: normalizeNumber(input.minimumSamples),
  };
}

function sanitizeMetrics(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, metricValue] of Object.entries(value)) {
    const normalized = normalizeNumber(metricValue);
    if (normalized === undefined) continue;
    out[key] = normalized;
  }
  return out;
}

function normalizeNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readBoolean(value?: string): boolean {
  if (!value) return false;
  return ["1", "true", "on", "yes"].includes(value.toLowerCase().trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRolloutStage(value: unknown): value is DocumentOpenRolloutStage {
  return value === "off"
    || value === "rules_internal"
    || value === "child_internal"
    || value === "descriptor_5"
    || value === "descriptor_25"
    || value === "full";
}

type RolloutSnapshot = {
  minimumSamples?: number;
  metrics?: unknown;
};
