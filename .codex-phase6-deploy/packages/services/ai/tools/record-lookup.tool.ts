import type {
  AtlasJsonObjectSchemaV1,
  AtlasJsonValue,
  AtlasReadOnlyToolHandlerContext,
  AtlasToolManifestV1,
  AtlasToolRegistration,
} from "./atlas-tool.types.js";
import { hashAtlasJson, normalizeAtlasJson } from "./atlas-tool-schema.js";
import {
  ATLAS_TOOL_READ_ACTION,
  ATLAS_TOOL_READ_PERMISSION,
} from "./catalog-help.tool.js";

export const ATLAS_RECORD_LOOKUP_TOOL_NAME = "atlas_record_lookup";
export const ATLAS_RECORD_LOOKUP_FEATURE = "atlas.tools.record_lookup";
export const ATLAS_ENTITY_READ_PERMISSION = "read";

const TOOL_VERSION = "1.0.0";
const IMPLEMENTATION_BINDING = "atlas.record.lookup.company-code.v1";
const CERTIFIED_ENTITY = "company_code";
const MAX_CARD_FIELDS = 8;
const CODE_SOURCE = normalizeAtlasJson({
  tool: ATLAS_RECORD_LOOKUP_TOOL_NAME,
  version: TOOL_VERSION,
  entity: CERTIFIED_ENTITY,
  output: "record_summary/v1",
  fieldLimit: MAX_CARD_FIELDS,
});
const CODE_CHECKSUM = `sha256:${hashAtlasJson(CODE_SOURCE)}` as const;

const inputSchema: AtlasJsonObjectSchemaV1 = {
  type: "object",
  description:
    "Load one certified company-code record by an exact identifier.",
  properties: {
    entity_type: {
      type: "string",
      maxLength: 64,
      enum: [CERTIFIED_ENTITY],
    },
    entity_id: {
      type: "string",
      minLength: 1,
      maxLength: 128,
    },
  },
  required: ["entity_type", "entity_id"],
  additionalProperties: false,
  maxProperties: 2,
};

const evidenceSchema: AtlasJsonObjectSchemaV1 = {
  type: "object",
  properties: {
    sourceId: { type: "string", maxLength: 200 },
    revisionId: { type: "string", maxLength: 128 },
    checksum: { type: "string", maxLength: 256 },
  },
  required: ["sourceId", "revisionId", "checksum"],
  additionalProperties: false,
  maxProperties: 3,
};

const resultSchema: AtlasJsonObjectSchemaV1 = {
  type: "object",
  properties: {
    card: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          maxLength: 32,
          enum: ["record_summary"],
        },
        version: { type: "integer", minimum: 1, maximum: 1 },
        entityType: {
          type: "string",
          maxLength: 64,
          enum: [CERTIFIED_ENTITY],
        },
        entityId: { type: "string", maxLength: 128 },
        title: { type: "string", maxLength: 200 },
        fields: {
          type: "array",
          maxItems: MAX_CARD_FIELDS,
          items: {
            type: "object",
            properties: {
              label: { type: "string", maxLength: 100 },
              displayValue: { type: "string", maxLength: 500 },
            },
            required: ["label", "displayValue"],
            additionalProperties: false,
            maxProperties: 2,
          },
        },
        evidence: {
          type: "array",
          maxItems: 1,
          items: evidenceSchema,
        },
      },
      required: [
        "kind",
        "version",
        "entityType",
        "entityId",
        "title",
        "fields",
        "evidence",
      ],
      additionalProperties: false,
      maxProperties: 7,
    },
  },
  required: ["card"],
  additionalProperties: false,
  maxProperties: 1,
};

export const atlasRecordLookupManifest = Object.freeze({
  schemaVersion: "atlas.tool.manifest/v1",
  name: ATLAS_RECORD_LOOKUP_TOOL_NAME,
  version: TOOL_VERSION,
  displayName: "Company code lookup",
  description:
    "Loads one authorized company-code summary by exact identifier through the Atlas data gateway.",
  access: "read_only",
  risk: "low",
  actionCode: ATLAS_TOOL_READ_ACTION,
  featureKey: ATLAS_RECORD_LOOKUP_FEATURE,
  allowedPlanes: Object.freeze(["neon"]),
  requiredPermissions: Object.freeze([
    ATLAS_TOOL_READ_PERMISSION,
    ATLAS_ENTITY_READ_PERMISSION,
  ]),
  timeoutMs: 2_500,
  maxResultBytes: 16_384,
  idempotency: Object.freeze({
    mode: "required",
    key: "run_id+tool_call_id",
    conflict: "same_input_hash_only",
  }),
  confirmation: Object.freeze({ mode: "none" }),
  stepUp: Object.freeze({ mode: "none" }),
  dualControl: Object.freeze({ mode: "none" }),
  implementation: Object.freeze({
    kind: "code",
    binding: IMPLEMENTATION_BINDING,
  }),
  audit: Object.freeze({
    lifecycle: "proposed_executing_terminal",
    arguments: "sha256",
    results: "sha256",
    contentStorage: "forbidden",
  }),
  evidence: Object.freeze({
    mode: "code_and_atlas_gateway",
    requireVersion: true,
    requireChecksumForCode: true,
  }),
  dataAccess: Object.freeze({
    mode: "atlas_gateway",
    permissionCodes: Object.freeze([ATLAS_ENTITY_READ_PERMISSION]),
    sourceKinds: Object.freeze(["record"] as const),
    maxReads: 1,
  }),
  inputSchema,
  resultSchema,
  source: Object.freeze({
    kind: "code",
    sourceId: "atlas.record.lookup.company-code",
    sourceVersionId: TOOL_VERSION,
    sourceChecksum: CODE_CHECKSUM,
  }),
} satisfies AtlasToolManifestV1);

export const atlasRecordLookupRegistration: AtlasToolRegistration =
  Object.freeze({
    manifest: atlasRecordLookupManifest,
    status: "enabled",
    implementationBinding: IMPLEMENTATION_BINDING,
    handler: async (
      context: AtlasReadOnlyToolHandlerContext,
      input: AtlasJsonValue,
    ) => {
      const { entityType, entityId } = readInput(input);
      const loaded = await context.readData({
        permissionCode: ATLAS_ENTITY_READ_PERMISSION,
        entityCode: entityType,
        sourceKind: "record",
        sourceId: entityId,
      });
      const record = jsonObject(loaded.data);
      const checksum = loaded.evidence.sourceChecksum;
      if (!checksum) throw new Error("Record evidence checksum is required.");
      const title = recordTitle(record, entityId);
      const fields = Object.entries(record)
        .filter(([key, value]) =>
          key !== "id"
          && isDisplayScalar(value)
        )
        .slice(0, MAX_CARD_FIELDS)
        .map(([key, value]) => ({
          label: humanize(key),
          displayValue: displayValue(value),
        }));
      return Object.freeze({
        data: {
          card: {
            kind: "record_summary",
            version: 1,
            entityType,
            entityId,
            title,
            fields,
            evidence: [{
              sourceId: loaded.evidence.sourceId,
              revisionId: loaded.evidence.sourceVersionId,
              checksum,
            }],
          },
        },
      });
    },
  });

function readInput(input: AtlasJsonValue): {
  entityType: typeof CERTIFIED_ENTITY;
  entityId: string;
} {
  const value = jsonObject(input);
  const entityType = value["entity_type"];
  const entityId = value["entity_id"];
  if (
    entityType !== CERTIFIED_ENTITY
    || typeof entityId !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(entityId)
  ) {
    throw new Error("Invalid certified record lookup input.");
  }
  return { entityType, entityId };
}

function jsonObject(value: AtlasJsonValue): Readonly<Record<string, AtlasJsonValue>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Atlas record lookup expected a JSON object.");
  }
  return value as Readonly<Record<string, AtlasJsonValue>>;
}

function recordTitle(
  record: Readonly<Record<string, AtlasJsonValue>>,
  fallback: string,
): string {
  for (const key of ["display_name", "name", "title", "code"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim().slice(0, 200);
    }
  }
  return fallback;
}

function isDisplayScalar(
  value: AtlasJsonValue,
): value is string | number | boolean | null {
  return value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean";
}

function displayValue(value: AtlasJsonValue): string {
  if (!isDisplayScalar(value)) {
    throw new Error("Atlas record lookup display value must be scalar.");
  }
  if (value === null) return "—";
  return String(value).slice(0, 500);
}

function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .slice(0, 100);
}
