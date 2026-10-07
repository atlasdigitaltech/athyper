import type { createProductReferenceResourcePolicies } from "@athyper/server-plane-studio-meta-entity-authoring";
type Policies = Parameters<typeof createProductReferenceResourcePolicies>[0];
export type ReferenceResourceConfiguration = Pick<
  Policies,
  | "descriptorPin"
  | "descriptorHash"
  | "maximumBytes"
  | "maximumReleases"
  | "supportedLocales"
>;
/** Deployment configuration contains pins and budgets only. It cannot provide
 * principals, approvals, callbacks or permission overrides. Trust is host-owned. */
export function parseReferenceResourceConfiguration(
  value: unknown,
): ReferenceResourceConfiguration {
  const object = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== "object" || Array.isArray(v))
      throw Error("REFERENCE_RESOURCE_CONFIGURATION_INVALID");
    return v as Record<string, unknown>;
  };
  const raw = object(value),
    pin = object(raw.descriptorPin),
    hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
  if (
    Object.keys(raw).sort().join() !==
      "descriptorHash,descriptorPin,maximumBytes,maximumReleases,supportedLocales" ||
    Object.keys(pin).sort().join() !==
      "artifactHash,kind,publicationKey,releaseId,unsignedHash" ||
    pin.kind !== "entity_authoring_descriptor" ||
    typeof pin.releaseId !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      pin.releaseId,
    ) ||
    typeof pin.publicationKey !== "string" ||
    !/^[a-z][a-z0-9_.:-]{1,190}$/.test(pin.publicationKey) ||
    !hash(pin.artifactHash) ||
    !hash(pin.unsignedHash) ||
    !hash(raw.descriptorHash) ||
    !Number.isSafeInteger(raw.maximumBytes) ||
    (raw.maximumBytes as number) < 1 ||
    (raw.maximumBytes as number) > 4194304 ||
    !Number.isSafeInteger(raw.maximumReleases) ||
    (raw.maximumReleases as number) < 1 ||
    (raw.maximumReleases as number) > 10000 ||
    !Array.isArray(raw.supportedLocales) ||
    !raw.supportedLocales.length ||
    raw.supportedLocales.some((v) => typeof v !== "string" || !v.trim()) ||
    new Set(raw.supportedLocales).size !== raw.supportedLocales.length
  )
    throw Error("REFERENCE_RESOURCE_CONFIGURATION_INVALID");
  return structuredClone(raw) as unknown as ReferenceResourceConfiguration;
}
