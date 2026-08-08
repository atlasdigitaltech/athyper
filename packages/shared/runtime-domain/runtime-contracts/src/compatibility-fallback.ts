const reportedCompatibilityFallbacks = new Set<string>();
const compatibilityFallbackRecords = new Map<string, MetadataCompatibilityFallbackRecord>();

export interface MetadataCompatibilityFallbackRecord {
  area: string;
  subjectKind: "field" | "descriptor";
  subjectName: string;
  /** Backward-compatible alias retained for existing field-fallback reports. */
  fieldName: string;
  convention: string;
  expectedMetadata: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

/**
 * Reports legacy field-name inference without breaking older descriptors.
 * Metadata-aware callers must invoke this only after explicit metadata and
 * data-type resolution have both failed.
 */
export function reportMetadataCompatibilityFallback(input: {
  area: string;
  fieldName?: string;
  subjectKind?: "field" | "descriptor";
  subjectName?: string;
  convention: string;
  expectedMetadata: string;
}): void {
  const subjectKind = input.subjectKind ?? "field";
  const subjectName = input.subjectName ?? input.fieldName;
  if (!subjectName) throw new Error("Compatibility fallback telemetry requires a subject name.");
  const fieldName = input.fieldName ?? subjectName;
  const normalized = { ...input, subjectKind, subjectName, fieldName };
  const key = `${input.area}:${subjectKind}:${subjectName}:${input.convention}`;
  const now = new Date().toISOString();
  const previous = compatibilityFallbackRecords.get(key);
  compatibilityFallbackRecords.set(key, previous
    ? { ...previous, count: previous.count + 1, lastSeenAt: now }
    : { ...normalized, count: 1, firstSeenAt: now, lastSeenAt: now });

  if (reportedCompatibilityFallbacks.has(key)) return;
  reportedCompatibilityFallbacks.add(key);

  const logger = (globalThis as { console?: { warn: (message: string) => void } }).console;
  logger?.warn(
    `[metadata-compatibility-fallback] ${input.area} inferred behavior for ${subjectKind} `
    + `"${subjectName}" from compatibility convention "${input.convention}". `
    + `Declare ${input.expectedMetadata}; naming conventions are legacy fallback only.`,
  );
}

/** Returns a stable snapshot suitable for diagnostics or telemetry export. */
export function readMetadataCompatibilityFallbacks(): MetadataCompatibilityFallbackRecord[] {
  return [...compatibilityFallbackRecords.values()]
    .map((record) => ({ ...record }))
    .sort((a, b) => `${a.area}:${a.subjectKind}:${a.subjectName}`
      .localeCompare(`${b.area}:${b.subjectKind}:${b.subjectName}`));
}

/** Test/diagnostic reset; production callers normally only read snapshots. */
export function clearMetadataCompatibilityFallbacks(): void {
  reportedCompatibilityFallbacks.clear();
  compatibilityFallbackRecords.clear();
}
