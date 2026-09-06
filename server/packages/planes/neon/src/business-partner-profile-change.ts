import { createHash } from "node:crypto";

// Canonical account codes, roles, lifecycle, tax and bank authority are never
// writable through a received profile change.
export const profileChangeFields = Object.freeze([
  "displayName", "legalName", "legalForm", "countryCode",
  "incorporationDate", "websiteUrl", "description",
] as const);
export type ProfileChangeClassification = "unchanged" | "source_only" | "local_only" | "converged" | "conflict" | "unbased";
export type ProfileChangeField = Readonly<{
  path: string; baseline: string | null; incoming: string | null; current: string | null;
  classification: ProfileChangeClassification;
}>;
export type ProfileChangePreview = Readonly<{
  baselineSnapshotId: string; incomingSnapshotId: string; businessPartnerId: string;
  targetVersion: number; fields: readonly ProfileChangeField[]; fingerprint: string;
}>;

export function compareProfileChange(input: {
  baselineSnapshotId: string; incomingSnapshotId: string; businessPartnerId: string; targetVersion: number;
  baseline: Readonly<Record<string, unknown>>; incoming: Readonly<Record<string, unknown>>;
  current: Readonly<Record<string, unknown>>; acceptedBaselinePaths: readonly string[];
}): ProfileChangePreview {
  if (!Number.isSafeInteger(input.targetVersion) || input.targetVersion < 1) throw new Error("MESH_PROFILE_CHANGE_VERSION_INVALID");
  const fields = profileChangeFields.map(field => {
    const path = `partner.${field}`, baseline = scalar(input.baseline[field]), incoming = scalar(input.incoming[field]), current = scalar(input.current[field]);
    const classification: ProfileChangeClassification = !input.acceptedBaselinePaths.includes(path) ? "unbased"
      : incoming === baseline && current === baseline ? "unchanged"
      : incoming === current ? "converged"
      : current === baseline ? "source_only"
      : incoming === baseline ? "local_only" : "conflict";
    return {path, baseline, incoming, current, classification};
  });
  const preview = {baselineSnapshotId: input.baselineSnapshotId, incomingSnapshotId: input.incomingSnapshotId,
    businessPartnerId: input.businessPartnerId, targetVersion: input.targetVersion, fields};
  return {...preview, fingerprint: createHash("sha256").update(JSON.stringify(preview)).digest("hex")};
}

// The resolution producer recomputes this preview under source/target locks.
// The native materializer rechecks each retained choice against the approved snapshot.
export function resolveProfileChange(preview: ProfileChangePreview, fingerprint: string, decisions: Readonly<Record<string, "source" | "local">>) {
  if (fingerprint !== preview.fingerprint) throw new Error("MESH_PROFILE_CHANGE_STALE");
  if (Object.keys(decisions).some(path => !preview.fields.some(field => field.path === path))) throw new Error("MESH_PROFILE_CHANGE_FIELD_INVALID");
  const proposed: Record<string, string | null> = {};
  for (const field of preview.fields) {
    const decision = decisions[field.path];
    if (decision !== "source" && decision !== "local") throw new Error("MESH_PROFILE_CHANGE_DECISION_REQUIRED");
    const value = decision === "source" ? field.incoming : field.current;
    if (field.path === "partner.legalName" && !value?.trim()) throw new Error("MESH_PROFILE_CHANGE_LEGAL_NAME_REQUIRED");
    proposed[field.path] = value;
  }
  return {fingerprint, proposed, decisions: {...decisions}};
}
function scalar(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > 10000) throw new Error("MESH_PROFILE_CHANGE_VALUE_INVALID");
  return value;
}
