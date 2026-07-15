import type {
  FxRateSnapshot,
  FxRateSource,
} from "./fx-rate.types.js";

export interface BuildFxRateSnapshotInput {
  source: FxRateSource;
  rateType: FxRateSnapshot["rateType"];
  asOfDate: string;
  fixed: boolean;
  sourceDocumentType?: string | null;
  sourceDocumentId?: string | null;
  lookupMethod?: string | null;
  lookupSource?: string | null;
  effectiveDate?: string | null;
  resolvedAt?: string | Date | null;
}

export function buildFxRateSnapshot(input: BuildFxRateSnapshotInput): FxRateSnapshot {
  const resolvedAt = input.resolvedAt instanceof Date
    ? input.resolvedAt.toISOString()
    : String(input.resolvedAt ?? new Date().toISOString());

  return {
    source: input.source,
    rateType: input.rateType,
    asOfDate: input.asOfDate,
    sourceDocumentType: input.sourceDocumentType ?? null,
    sourceDocumentId: input.sourceDocumentId ?? null,
    fixed: input.fixed,
    resolver: "fx.resolve_rate",
    resolvedAt,
    lookupMethod: input.lookupMethod ?? null,
    lookupSource: input.lookupSource ?? null,
    effectiveDate: input.effectiveDate ?? null,
  };
}
