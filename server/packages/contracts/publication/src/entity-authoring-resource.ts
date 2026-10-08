import {
  parseEntityLiveReadResource,
  type EntityLiveReadResource,
  type EntityLiveReadResourceKind,
} from "./entity-live-read-resource.js";
import { PublicationContractError } from "./errors.js";
export type EntityAuthoringResourceKind =
  | "entity_authoring_descriptor"
  | "entity_identity_review"
  | EntityLiveReadResourceKind;
export interface AuthoringDescriptorResource {
  readonly schema: "entity.installed-authoring-descriptor/1";
  readonly schemaVersion: number;
  readonly descriptorHash: string;
  readonly descriptor: Readonly<Record<string, unknown>>;
}
export interface IdentityReviewResource {
  readonly schema: "entity.legacy-identity-review/1";
  readonly reference: string;
  readonly entityId: string;
  readonly changeSetId: string;
  readonly tenantId: null;
  readonly sourceHash: string;
  readonly authoringSchemaHash: string;
  readonly reviewedPlanHash: string;
  readonly proposerId: string;
  readonly reviewerId: string;
  readonly releases: readonly {
    releaseId: string;
    previousSourceHash: string;
    mappings: readonly { currentFieldId: string; previousFieldId: string }[];
    rebindRequiredPreviousFieldIds: readonly string[];
  }[];
}
export type EntityAuthoringResource =
  AuthoringDescriptorResource | IdentityReviewResource | EntityLiveReadResource;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    v,
  );
const keys = (v: Record<string, unknown>, k: string[]) =>
  Object.keys(v).sort().join() === k.sort().join();
const fail = (): never => {
  throw new PublicationContractError(
    "ARTIFACT_PAYLOAD_INVALID",
    "Invalid Entity authoring resource",
  );
};
export function parseEntityAuthoringResource(
  kind: EntityAuthoringResourceKind,
  value: unknown,
): EntityAuthoringResource {
  if (
    kind === "entity_security_manifest" ||
    kind === "entity_storage_authority"
  )
    return parseEntityLiveReadResource(kind, value);
  if (!object(value)) return fail();
  if (kind === "entity_authoring_descriptor") {
    if (
      !keys(value, [
        "schema",
        "schemaVersion",
        "descriptorHash",
        "descriptor",
      ]) ||
      value.schema !== "entity.installed-authoring-descriptor/1" ||
      !Number.isSafeInteger(value.schemaVersion) ||
      (value.schemaVersion as number) < 1 ||
      !hash(value.descriptorHash) ||
      !object(value.descriptor)
    )
      return fail();
  } else if (kind === "entity_identity_review") {
    if (
      !keys(value, [
        "schema",
        "reference",
        "entityId",
        "changeSetId",
        "tenantId",
        "sourceHash",
        "authoringSchemaHash",
        "reviewedPlanHash",
        "proposerId",
        "reviewerId",
        "releases",
      ]) ||
      value.schema !== "entity.legacy-identity-review/1" ||
      typeof value.reference !== "string" ||
      !value.reference.trim() ||
      value.reference.length > 1024 ||
      value.tenantId !== null ||
      ![
        value.entityId,
        value.changeSetId,
        value.proposerId,
        value.reviewerId,
      ].every(uuid) ||
      value.proposerId === value.reviewerId ||
      ![
        value.sourceHash,
        value.authoringSchemaHash,
        value.reviewedPlanHash,
      ].every(hash) ||
      !Array.isArray(value.releases)
    )
      return fail();
    const releases = new Set<string>();
    for (const r of value.releases) {
      if (
        !object(r) ||
        !keys(r, [
          "releaseId",
          "previousSourceHash",
          "mappings",
          "rebindRequiredPreviousFieldIds",
        ]) ||
        !uuid(r.releaseId) ||
        !hash(r.previousSourceHash) ||
        !Array.isArray(r.mappings) ||
        !Array.isArray(r.rebindRequiredPreviousFieldIds) ||
        !r.rebindRequiredPreviousFieldIds.every(uuid) ||
        releases.has(r.releaseId as string)
      )
        return fail();
      releases.add(r.releaseId as string);
      const old = new Set<string>(),
        current = new Set<string>();
      for (const m of r.mappings) {
        if (
          !object(m) ||
          !keys(m, ["currentFieldId", "previousFieldId"]) ||
          !uuid(m.currentFieldId) ||
          !uuid(m.previousFieldId) ||
          old.has(m.previousFieldId as string) ||
          current.has(m.currentFieldId as string)
        )
          return fail();
        old.add(m.previousFieldId as string);
        current.add(m.currentFieldId as string);
      }
      for (const id of r.rebindRequiredPreviousFieldIds) {
        if (old.has(id)) return fail();
        old.add(id);
      }
    }
  } else return fail();
  return structuredClone(value) as unknown as EntityAuthoringResource;
}

/** Immutable generated resource source; not a writable Entity authoring graph. */
export interface EntityAuthoringResourceSource {
  readonly releaseId: string;
  readonly publicationKey: string;
  readonly releaseNo: number;
  readonly generatedAt: string;
  readonly kind: EntityAuthoringResourceKind;
  readonly payload: unknown;
}
