import { sql, type Kysely } from "kysely";
import {
  MetaEntityContractV21Schema,
  type MetaEntityContractV21,
} from "@athyper/api-contracts/meta-entity-contract-v21";
import {
  hydrateExecutionDescriptor,
  type SerializedExecutionDescriptorV1,
} from "./execution-descriptor/contract.js";
import type { ExecutionDescriptorPlane } from "./execution-descriptor/provider.js";
import type { CompiledEntity } from "./entity-compiler.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export type RuntimeAdmissionFailureCode =
  | "PUBLISHED_VERSION_REQUIRED"
  | "PUBLISHED_VERSION_NOT_EFFECTIVE"
  | "PUBLISHED_DESCRIPTOR_NOT_READY"
  | "PUBLISHED_DESCRIPTOR_HASH_MISMATCH"
  | "CATALOG_NOT_ACTIVE"
  | "RUNTIME_DISABLED"
  | "PLANE_NOT_ELIGIBLE"
  | "API_EXPOSURE_DENIED"
  | "BACKING_AUTHORITY_DENIED"
  | "EXECUTION_DESCRIPTOR_INVALID";

export class RuntimeDescriptorAdmissionError extends Error {
  constructor(
    readonly code: RuntimeAdmissionFailureCode,
    message: string,
    readonly status: 404 | 409 | 422 = 404,
  ) {
    super(message);
    this.name = "RuntimeDescriptorAdmissionError";
  }
}

export interface PublishedRuntimeDescriptor {
  readonly plane: ExecutionDescriptorPlane;
  readonly tenantId: string;
  readonly entityCode: string;
  readonly publishedVersionId: string;
  readonly contractHash: string;
  readonly compiledHash: string;
  readonly cacheKey: string;
  readonly contract: MetaEntityContractV21;
  readonly compiled: CompiledEntity;
  readonly executionDescriptor: SerializedExecutionDescriptorV1;
}

interface PublishedPlaneRow {
  entity_code: string;
  published_version_id: string | null;
  version_status: string | null;
  readiness_status: string | null;
  contract_hash: string | null;
  expected_compiled_hash: string | null;
  snapshot_contract_hash: string | null;
  snapshot_materialized_hash: string | null;
  snapshot_compiled_hash: string | null;
  compiled_json: unknown;
}

const ALLOWED_BACKING = new Set(["table", "view", "materialized_view"]);

/**
 * The sole structural runtime admission boundary.
 *
 * It deliberately does not consult behavioral compatibility columns on
 * control.entity. Identity lookup is stable; all behavior and eligibility are
 * read from the exact published plane artifact and its canonical Contract.
 * Principal/module/partner grants remain request-specific and are enforced by
 * the route permission context after this admission succeeds.
 */
export async function loadPublishedRuntimeDescriptor(
  db: AnyDb,
  input: {
    entityCode: string;
    tenantId: string;
    plane: ExecutionDescriptorPlane;
    requireApi?: boolean;
  },
): Promise<PublishedRuntimeDescriptor> {
  const normalized = input.entityCode.replace(/-/g, "_");
  const result = await sql<PublishedPlaneRow>`
    SELECT entity.entity_code,
           state.published_version_id::text AS published_version_id,
           version.status AS version_status,
           state.readiness_status,
           state.contract_hash,
           CASE ${input.plane}
             WHEN 'admin' THEN state.admin_compiled_hash
             WHEN 'mesh' THEN state.mesh_compiled_hash
             ELSE state.neon_compiled_hash
           END AS expected_compiled_hash,
           artifact.contract_hash AS snapshot_contract_hash,
           artifact.materialized_hash AS snapshot_materialized_hash,
           artifact.compiled_hash AS snapshot_compiled_hash,
           artifact.compiled_json
      FROM control.entity entity
      JOIN control.entity_publish_state state
        ON state.entity_id=entity.id
       AND state.tenant_id IS NOT DISTINCT FROM entity.tenant_id
      LEFT JOIN control.entity_version version
        ON version.id=state.published_version_id
      LEFT JOIN snapshot.entity_plane_compiled artifact
        ON artifact.entity_version_id=state.published_version_id
       AND artifact.plane_key=${input.plane}
       AND artifact.tenant_id IS NOT DISTINCT FROM state.tenant_id
     WHERE (
       entity.entity_code=${normalized}
       OR entity.name=${normalized}
       OR entity.slug=${input.entityCode.replace(/_/g, "-")}
     )
       AND (entity.tenant_id=${input.tenantId}::uuid OR entity.tenant_id IS NULL)
     ORDER BY entity.tenant_id IS NULL ASC
     LIMIT 1
  `.execute(db);
  const row = result.rows[0];
  if (!row?.published_version_id) {
    throw new RuntimeDescriptorAdmissionError(
      "PUBLISHED_VERSION_REQUIRED",
      `Entity '${normalized}' has no published version.`,
    );
  }
  if (row.version_status !== "EFFECTIVE") {
    throw new RuntimeDescriptorAdmissionError(
      "PUBLISHED_VERSION_NOT_EFFECTIVE",
      `Published version '${row.published_version_id}' is not EFFECTIVE.`,
      409,
    );
  }
  if (row.readiness_status !== "READY" || !row.compiled_json) {
    throw new RuntimeDescriptorAdmissionError(
      "PUBLISHED_DESCRIPTOR_NOT_READY",
      `Entity '${normalized}' does not have a READY ${input.plane} descriptor.`,
      409,
    );
  }
  if (!row.contract_hash
      || row.snapshot_contract_hash !== row.contract_hash
      || row.snapshot_materialized_hash !== row.contract_hash
      || row.snapshot_compiled_hash !== row.expected_compiled_hash) {
    throw new RuntimeDescriptorAdmissionError(
      "PUBLISHED_DESCRIPTOR_HASH_MISMATCH",
      `Published ${input.plane} descriptor hashes do not match publication state.`,
      409,
    );
  }

  const root = asRecord(row.compiled_json);
  const contractResult = MetaEntityContractV21Schema.safeParse(root?.["contract_v21"]);
  if (!root || !contractResult.success) {
    throw new RuntimeDescriptorAdmissionError(
      "PUBLISHED_DESCRIPTOR_NOT_READY",
      "Published descriptor does not contain a valid Contract v2.1 document.",
      422,
    );
  }
  const contract = contractResult.data;
  if (!contract.catalog.enabled) {
    throw new RuntimeDescriptorAdmissionError("CATALOG_NOT_ACTIVE", `Entity '${normalized}' is not ACTIVE.`);
  }
  if (!contract.runtime.runtime_enabled) {
    throw new RuntimeDescriptorAdmissionError("RUNTIME_DISABLED", `Entity '${normalized}' is not runtime-enabled.`);
  }
  if (!contract.catalog.plane_eligibility.includes(input.plane)) {
    throw new RuntimeDescriptorAdmissionError(
      "PLANE_NOT_ELIGIBLE",
      `Entity '${normalized}' is not eligible for plane '${input.plane}'.`,
    );
  }
  if ((input.requireApi ?? true) && contract.runtime.api_exposure !== "API") {
    throw new RuntimeDescriptorAdmissionError(
      "API_EXPOSURE_DENIED",
      `Entity '${normalized}' is not exposed through the runtime API.`,
    );
  }
  if (!ALLOWED_BACKING.has(contract.runtime.storage.backing_type)) {
    throw new RuntimeDescriptorAdmissionError(
      "BACKING_AUTHORITY_DENIED",
      `Backing type '${contract.runtime.storage.backing_type}' is not allowed by generic runtime authority.`,
      422,
    );
  }

  const execution = root["execution_descriptor"];
  try {
    const hydrated = hydrateExecutionDescriptor(execution);
    if (hydrated.identity.entityVersionId !== row.published_version_id
        || hydrated.identity.entityCode !== contract.catalog.entity_code) {
      throw new Error("execution identity does not match publication");
    }
  } catch (cause) {
    throw new RuntimeDescriptorAdmissionError(
      "EXECUTION_DESCRIPTOR_INVALID",
      `Published execution descriptor failed admission: ${String(cause)}`,
      422,
    );
  }

  const compiledHash = row.snapshot_compiled_hash!;
  return Object.freeze({
    plane: input.plane,
    tenantId: input.tenantId,
    entityCode: contract.catalog.entity_code,
    publishedVersionId: row.published_version_id,
    contractHash: row.contract_hash,
    compiledHash,
    cacheKey: [
      input.tenantId,
      contract.catalog.entity_code,
      row.published_version_id,
      compiledHash,
      input.plane,
    ].join(":"),
    contract,
    compiled: root as unknown as CompiledEntity,
    executionDescriptor: execution as SerializedExecutionDescriptorV1,
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try { return asRecord(JSON.parse(value) as unknown); } catch { return null; }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
