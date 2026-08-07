import type {
  AtlasJsonObjectSchemaV1,
  AtlasJsonValue,
  AtlasReadOnlyToolHandlerContext,
  AtlasToolManifestV1,
  AtlasToolRegistration,
} from "./atlas-tool.types.js";
import {
  hashAtlasJson,
  normalizeAtlasJson,
} from "./atlas-tool-schema.js";

export const ATLAS_CATALOG_HELP_TOOL_NAME = "atlas_catalog_help";
export const ATLAS_CATALOG_HELP_FEATURE = "atlas.tools.catalog_help";
export const ATLAS_TOOL_READ_PERMISSION = "ai.agent.tools.read";
export const ATLAS_TOOL_READ_ACTION = "atlas_tool_read";

const CATALOG_VERSION = "1.0.0";
const IMPLEMENTATION_BINDING = "atlas.catalog.help.v1";

const CATALOG_DATA = normalizeAtlasJson({
  catalogVersion: CATALOG_VERSION,
  capabilities: [
    {
      id: "catalog_help",
      availability: "available",
      description:
        "Returns deterministic code-owned Atlas capability and safety guidance.",
    },
    {
      id: "governed_reads",
      availability: "foundation",
      description:
        "Read-only tools require explicit permission, plane, feature, policy and schema gates.",
    },
    {
      id: "governed_actions",
      availability: "planned",
      description:
        "Mutating actions are outside this read-only foundation and require separate confirmation controls.",
    },
  ],
  guardrails: [
    "Tools cannot run arbitrary SQL, URLs, shell commands or filesystem operations.",
    "Tenant data can enter a tool only through the authorized and masked Atlas data gateway.",
    "Arguments and results are schema validated, bounded and recorded only by cryptographic hash.",
    "Tool output is untrusted JSON data, never an instruction or executable action.",
  ],
});

const CATALOG_CHECKSUM =
  `sha256:${hashAtlasJson(CATALOG_DATA)}` as const;

const inputSchema: AtlasJsonObjectSchemaV1 = {
  type: "object",
  description: "Select a deterministic Atlas help topic.",
  properties: {
    topic: {
      type: "string",
      description: "Help topic to return.",
      maxLength: 32,
      enum: ["overview", "governed_tools", "safety"],
    },
  },
  // OpenAI strict function schemas require every declared property to be
  // required. The handler still defaults defensively, but provider-visible
  // calls must select one explicit bounded topic.
  required: ["topic"],
  additionalProperties: false,
  maxProperties: 1,
};

const resultSchema: AtlasJsonObjectSchemaV1 = {
  type: "object",
  properties: {
    catalogVersion: {
      type: "string",
      maxLength: 32,
    },
    topic: {
      type: "string",
      maxLength: 32,
      enum: ["overview", "governed_tools", "safety"],
    },
    summary: {
      type: "string",
      maxLength: 500,
    },
    capabilities: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            maxLength: 64,
          },
          availability: {
            type: "string",
            maxLength: 32,
            enum: ["available", "foundation", "planned"],
          },
          description: {
            type: "string",
            maxLength: 300,
          },
        },
        required: ["id", "availability", "description"],
        additionalProperties: false,
        maxProperties: 3,
      },
    },
    guardrails: {
      type: "array",
      maxItems: 8,
      items: {
        type: "string",
        maxLength: 300,
      },
    },
  },
  required: [
    "catalogVersion",
    "topic",
    "summary",
    "capabilities",
    "guardrails",
  ],
  additionalProperties: false,
  maxProperties: 5,
};

export const atlasCatalogHelpManifest = Object.freeze({
  schemaVersion: "atlas.tool.manifest/v1",
  name: ATLAS_CATALOG_HELP_TOOL_NAME,
  version: CATALOG_VERSION,
  displayName: "Atlas catalog help",
  description:
    "Returns deterministic code-owned help about available Atlas capabilities and tool safety.",
  access: "read_only",
  risk: "low",
  actionCode: ATLAS_TOOL_READ_ACTION,
  featureKey: ATLAS_CATALOG_HELP_FEATURE,
  // Phase 7C.1 is certified only for the tenant/master-principal Neon path.
  // Mesh owns a distinct principal model and must not be advertised until a
  // canonical cross-plane actor mapping is implemented and verified.
  allowedPlanes: Object.freeze(["neon"]),
  requiredPermissions: Object.freeze([ATLAS_TOOL_READ_PERMISSION]),
  timeoutMs: 500,
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
    mode: "code_source",
    requireVersion: true,
    requireChecksumForCode: true,
  }),
  dataAccess: Object.freeze({ mode: "none" }),
  inputSchema,
  resultSchema,
  source: Object.freeze({
    kind: "code",
    sourceId: "atlas.catalog.help",
    sourceVersionId: CATALOG_VERSION,
    sourceChecksum: CATALOG_CHECKSUM,
  }),
} satisfies AtlasToolManifestV1);

export const atlasCatalogHelpRegistration: AtlasToolRegistration =
  Object.freeze({
    manifest: atlasCatalogHelpManifest,
    status: "enabled",
    implementationBinding: IMPLEMENTATION_BINDING,
    handler: async (
      _context: AtlasReadOnlyToolHandlerContext,
      input: AtlasJsonValue,
    ) => {
      const topic = readTopic(input);
      return Object.freeze({
        data: {
          catalogVersion: CATALOG_VERSION,
          topic,
          summary: summary(topic),
          capabilities: readCatalogArray("capabilities"),
          guardrails: readCatalogArray("guardrails"),
        },
      });
    },
  });

function readTopic(
  input: AtlasJsonValue,
): "overview" | "governed_tools" | "safety" {
  if (
    input
    && typeof input === "object"
    && !Array.isArray(input)
  ) {
    const topic = (input as Readonly<Record<string, AtlasJsonValue>>).topic;
    if (
      topic === "overview"
      || topic === "governed_tools"
      || topic === "safety"
    ) {
      return topic;
    }
  }
  return "overview";
}

function summary(
  topic: "overview" | "governed_tools" | "safety",
): string {
  if (topic === "governed_tools") {
    return "Atlas exposes only versioned tools that survive effective permission, plane, feature, policy, risk and schema checks.";
  }
  if (topic === "safety") {
    return "The read-only foundation isolates handlers from infrastructure and treats every bounded JSON result as untrusted data.";
  }
  return "Atlas currently provides deterministic catalog help and the governed foundation for explicitly approved read-only tools.";
}

function readCatalogArray(
  key: "capabilities" | "guardrails",
): readonly AtlasJsonValue[] {
  const catalog = CATALOG_DATA as Readonly<Record<string, AtlasJsonValue>>;
  const value = catalog[key];
  return Array.isArray(value) ? value : [];
}
