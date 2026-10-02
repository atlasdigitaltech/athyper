import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { atlasEntityRecordManifest, ENTITY_RECORD_TOOL } from "./entity-record-tool.js";
import { atlasEntityContextManifest, entityContextTool } from "./entity-context-tools.js";
import { atlasEntityLookupManifest, entityLookupTool } from "./entity-lookup-tools.js";
import { AtlasServiceError } from "./errors.js";
import { resolveAtlasManifestIdentity } from "./tool-service.js";

/** Closed trusted publication vocabulary shared with the actual tool factories.
 * This resolves content only: serving owner support is qualified separately. */
export function resolveAtlasEntityToolManifest(toolCode: string, version: string, plane: VerifiedRequestContext["planeKey"]) {
  if (version !== "1") throw new AtlasServiceError("TOOL_DENIED", "Unregistered Entity tool version.");
  const manifest = toolCode === ENTITY_RECORD_TOOL ? atlasEntityRecordManifest()
    : entityContextTool(toolCode) ? atlasEntityContextManifest(toolCode)
    : entityLookupTool(toolCode) ? atlasEntityLookupManifest(toolCode)
    : undefined;
  if (!manifest) throw new AtlasServiceError("TOOL_DENIED", "Unregistered Entity tool manifest.");
  return resolveAtlasManifestIdentity(manifest, plane);
}
