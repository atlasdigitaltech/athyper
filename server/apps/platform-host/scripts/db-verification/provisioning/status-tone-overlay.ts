/** Publish only header status tones; preserve all other pinned live metadata. */
export const statusToneArtifactKeys = ["business_partner/presentation.detail"] as const;
type Json = Record<string, any>;
export function statusToneOverlay(baseline: readonly Json[], sources: readonly Json[]): Json[] {
  const key = statusToneArtifactKeys[0];
  if (sources.length !== 1 || sources[0]?.artifactKey !== key)
    throw Error("STATUS_TONE_OVERLAY_SCOPE_INVALID");
  const result = structuredClone([...baseline]);
  const target = result.find(a => a.artifactKey === key);
  const header = sources[0].header;
  if (!target?.header || !header?.statusField || target.header.statusField !== header.statusField)
    throw Error("STATUS_TONE_HEADER_MISMATCH");
  const tones = header.statusTones;
  if (!tones || typeof tones !== "object" || Array.isArray(tones) || !Object.keys(tones).length ||
      Object.entries(tones).some(([status, tone]) => !/^[a-z][a-z0-9_-]*$/.test(status) ||
        !["neutral", "success", "warning", "danger"].includes(tone as string)))
    throw Error("STATUS_TONE_CONTRACT_INVALID");
  target.header.statusTones = structuredClone(tones);
  return result;
}
