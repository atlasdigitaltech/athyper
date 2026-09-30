import {
  parseCollectionConfiguration,
  COLLECTION_SCHEMA,
  type CollectionConfiguration,
} from "@athyper/contract-platform-collection";
export const COLLECTION_PUBLICATION_SCHEMA =
  "athyper.published-collection/1" as const;
export interface CollectionPublicationDescriptor {
  schema: typeof COLLECTION_PUBLICATION_SCHEMA;
  sourceEntityCode: string;
  configuration: CollectionConfiguration;
}
export function parseCollectionPublicationDescriptor(
  raw: unknown,
): CollectionPublicationDescriptor {
  const v = raw as CollectionPublicationDescriptor;
  if (
    !v ||
    v.schema !== COLLECTION_PUBLICATION_SCHEMA ||
    typeof v.sourceEntityCode !== "string" ||
    !/^[a-z][a-z0-9_]{1,62}$/.test(v.sourceEntityCode)
  )
    throw new TypeError("Invalid published collection descriptor");
  return {
    schema: COLLECTION_PUBLICATION_SCHEMA,
    sourceEntityCode: v.sourceEntityCode,
    configuration: parseCollectionConfiguration(v.configuration),
  };
}
/** Native configuration graph is a publication carrier, never an entity-record runtime. */
export function collectionPublicationFromGraph(
  raw: unknown,
): CollectionPublicationDescriptor | null {
  const g = raw as Record<string, any>;
  if (!g || !Array.isArray(g.surfaces)) return null;
  const surfaces = g.surfaces.filter(
    (s: any) => s.layoutConfig?.collectionConfiguration !== undefined,
  );
  if (!surfaces.length) return null;
  if (
    surfaces.length !== 1 ||
    g.surfaces.length !== 1 ||
    g.entity?.entityClass !== "configuration" ||
    surfaces[0].status === "deprecated"
  )
    throw new TypeError("Collection-only configuration graph required");
  for (const [key, value] of Object.entries(g))
    if (
      Array.isArray(value) &&
      value.length &&
      !["runtimeProfiles", "surfaces", "tests"].includes(key)
    )
      throw new TypeError(`Collection configuration cannot contain ${key}`);
  const profiles = g.runtimeProfiles;
  if (
    !Array.isArray(profiles) ||
    profiles.length !== 1 ||
    profiles[0].backingKind !== "virtual" ||
    profiles[0].apiExposure !== "catalog_only" ||
    profiles[0].readMode !== "none" ||
    profiles[0].writeMode !== "none"
  )
    throw new TypeError(
      "Collection configuration requires a catalog-only virtual profile",
    );
  const config = surfaces[0].layoutConfig.collectionConfiguration;
  if (config?.schema !== COLLECTION_SCHEMA)
    throw new TypeError("Unsupported collection configuration schema");
  return parseCollectionPublicationDescriptor({
    schema: COLLECTION_PUBLICATION_SCHEMA,
    sourceEntityCode: g.entity.entityCode,
    configuration: config,
  });
}
export function collectionPublicationKey(
  tenantId: string,
  collectionKey: string,
) {
  return `metadata.collection.${collectionKey}.${tenantId.replaceAll("-", "")}`;
}
