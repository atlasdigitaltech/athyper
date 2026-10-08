import {
  validateEntityResourcePinV1,
  validateEntitySecurityManifestV1,
  validateEntityStorageAuthorityV1,
  type EntityResourcePinV1,
  type EntitySecurityManifestV1,
  type EntityStorageAuthorityV1,
} from "@athyper/server-contract-metadata";
import { PublicationContractError } from "./errors.js";

export type EntityLiveReadResourceKind =
  "entity_security_manifest" | "entity_storage_authority";
export interface EntityLiveReadResource {
  readonly schema: "entity.installed-live-read-resource/1";
  readonly pin: EntityResourcePinV1;
  readonly content: EntitySecurityManifestV1 | EntityStorageAuthorityV1;
}
/** Shape and scope validation only. Review, signature, local installation,
 * revocation and content-hash verification remain publication/consumer duties. */
export function parseEntityLiveReadResource(
  kind: EntityLiveReadResourceKind,
  value: unknown,
): EntityLiveReadResource {
  try {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).sort().join() !== "content,pin,schema" ||
      Reflect.get(value, "schema") !== "entity.installed-live-read-resource/1"
    )
      throw Error();
    const pin = Reflect.get(value, "pin"),
      content = Reflect.get(value, "content");
    validateEntityResourcePinV1(pin);
    if (kind === "entity_security_manifest")
      validateEntitySecurityManifestV1(content);
    else if (kind === "entity_storage_authority")
      validateEntityStorageAuthorityV1(content);
    else throw Error();
    const tenant =
      content.schema === "entity.effective-security-manifest/1"
        ? content.scope.tenantId
        : content.tenantId;
    if (content.source.tenantId !== null && content.source.tenantId !== tenant)
      throw Error();
    return structuredClone(value) as EntityLiveReadResource;
  } catch {
    throw new PublicationContractError(
      "ARTIFACT_PAYLOAD_INVALID",
      "Invalid live-read resource",
    );
  }
}
