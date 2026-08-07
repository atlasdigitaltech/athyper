export const ATLAS_AGENT_SCHEMA_VERSION = "1.0" as const;

export function isSupportedAtlasAgentSchemaVersion(
  value: unknown,
): value is typeof ATLAS_AGENT_SCHEMA_VERSION {
  return value === ATLAS_AGENT_SCHEMA_VERSION;
}
