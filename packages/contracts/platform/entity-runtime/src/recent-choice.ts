/** Metadata governs history behaviour, never authenticated identity or eligibility. */
export interface RecentChoicePolicy {
  readonly enabled: boolean;
  readonly limit: number;
  readonly persistence?: "browser" | "server";
  readonly scope?: "referenceSource" | "businessContext";
  readonly retentionDays?: number;
}
export function parseRecentChoicePolicy(raw: unknown): RecentChoicePolicy {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new TypeError("Invalid recent choice policy");
  const r = raw as Record<string, unknown>;
  if (
    Object.keys(r).some(
      (key) =>
        !["enabled", "limit", "persistence", "scope", "retentionDays"].includes(
          key,
        ),
    )
  )
    throw new TypeError("Unknown recent choice property");
  if (
    typeof r.enabled !== "boolean" ||
    !Number.isInteger(r.limit) ||
    Number(r.limit) < 1 ||
    Number(r.limit) > 20
  )
    throw new TypeError("Invalid recent choice bounds");
  if (
    r.persistence !== undefined &&
    !["browser", "server"].includes(String(r.persistence))
  )
    throw new TypeError("Invalid recent persistence");
  if (
    r.scope !== undefined &&
    !["referenceSource", "businessContext"].includes(String(r.scope))
  )
    throw new TypeError("Invalid recent scope");
  if (
    r.retentionDays !== undefined &&
    (!Number.isInteger(r.retentionDays) ||
      Number(r.retentionDays) < 1 ||
      Number(r.retentionDays) > 90)
  )
    throw new TypeError("Invalid recent retention");
  return {
    enabled: r.enabled,
    limit: Number(r.limit),
    ...(r.persistence === undefined
      ? {}
      : { persistence: r.persistence as "browser" | "server" }),
    ...(r.scope === undefined
      ? {}
      : { scope: r.scope as "referenceSource" | "businessContext" }),
    ...(r.retentionDays === undefined
      ? {}
      : { retentionDays: Number(r.retentionDays) }),
  };
}
