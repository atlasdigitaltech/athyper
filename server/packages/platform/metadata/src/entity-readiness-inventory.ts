import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import {
  parseCompiledEntityArtifact,
  parseCompiledEntityReleaseEnvelope,
} from "@athyper/server-contract-publication";
import type { PlaneKey } from "@athyper/server-foundation/context";
import { sql, type Kysely } from "kysely";
import { parseCompiledRuntimeContract } from "./compiled-runtime-contract.js";
import {
  parseEntityRuntimeDescriptor,
  type RuntimeDescriptorRow,
} from "./descriptor-parser.js";

interface InventoryRow {
  readonly artifact_kind: "entity_runtime" | "compiled_entity_runtime";
  readonly source_release_id: string;
  readonly source_release_no: number;
  readonly descriptor: RuntimeDescriptorRow | null;
  readonly descriptor_kind: string | null;
  readonly payload: unknown;
}

/** Only coordinates from already-applied publications determine probe scope.
 * Legacy publishers encode scope in their publication key; newer headers can
 * declare it explicitly. Neither request input nor the pooled session is used.
 */
export function readinessInventoryTenant(
  publicationKey: string,
  tenant: unknown,
): string | null {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  const compiled =
    /^metadata\.compiled_entity\.[a-z][a-z0-9_]*\.tenant\.(.+)$/.exec(
      publicationKey,
    );
  const legacy =
    /^metadata\.(?:entity|notifications|collection)\.[a-z][a-z0-9_.]*\.([a-f0-9]{32})$/.exec(
      publicationKey,
    );
  const compact = legacy?.[1];
  const keyTenant =
    compiled?.[1] ??
    (compact
      ? `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`
      : null);
  if (
    (keyTenant !== null && !uuid.test(keyTenant)) ||
    (publicationKey.includes(".tenant.") && !compiled) ||
    (tenant != null && (typeof tenant !== "string" || !uuid.test(tenant))) ||
    (keyTenant !== null && tenant != null && keyTenant !== tenant)
  )
    throw Error("ENTITY_READINESS_INVENTORY_SCOPE_INVALID");
  return (tenant as string | null | undefined) ?? keyTenant;
}

/** Startup inventory uses the existing runtime role, without bypassing tenant RLS.
 * Heads are visible to that role: a hidden/missing Entity payload is an incomplete
 * inventory, never evidence that the deployment has no required capabilities.
 */
export function createEntityReadinessInventory(
  databases: Readonly<Partial<Record<PlaneKey, Kysely<Record<string, never>>>>>,
) {
  return async (): Promise<readonly EntityRuntimeDescriptor[]> => {
    const descriptors: EntityRuntimeDescriptor[] = [];
    for (const plane of ["studio", "neon", "mesh"] as const) {
      const database = databases[plane];
      if (!database) continue;
      const rows = await database
        .transaction()
        .setIsolationLevel("repeatable read")
        .execute(async (tx) => {
          await sql`SET TRANSACTION READ ONLY`.execute(tx);
          await sql`SET LOCAL statement_timeout='5000ms'`.execute(tx);
          const heads = (
            await sql<{
              applied_release_id: string;
              publication_key: string;
              tenant_id: unknown;
            }>`
            SELECT h.applied_release_id::text, h.publication_key,
                   a.manifest->'tenantId' AS tenant_id
              FROM runtime_meta.release_activation_head h
              JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id AND a.status='active'
             WHERE a.manifest->>'artifactKind' IN ('entity_runtime','compiled_entity_runtime')
             ORDER BY h.publication_key
          `.execute(tx)
          ).rows;
          const inventory: InventoryRow[] = [];
          for (const head of heads) {
            const tenant = readinessInventoryTenant(
              head.publication_key,
              head.tenant_id,
            );
            // Reset even for global releases: connections may have prior session context.
            await sql`SELECT set_config('app.current_tenant_id', ${tenant ?? ""}, true)`.execute(
              tx,
            );
            const result = await sql<InventoryRow>`
          SELECT a.manifest->>'artifactKind' AS artifact_kind,
                 a.source_release_id::text, a.source_release_no::int, d.descriptor_kind::text,
                 CASE WHEN d.id IS NOT NULL THEN jsonb_build_object(
                   'entity_code', c.entity_code, 'release_id', c.release_id::text,
                   'release_no', c.release_no, 'entity_contract_hash', c.entity_contract_hash,
                   'plane_code', d.plane_code, 'compiled_hash', d.compiled_hash,
                   'compiled_json', d.compiled_json) END AS descriptor,
                 p.payload_json AS payload
            FROM runtime_meta.release_activation_head h
            JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id AND a.status='active'
            LEFT JOIN runtime_meta.entity_descriptor d ON d.applied_release_id=a.id AND d.status='active' AND d.tenant_id IS NOT DISTINCT FROM ${tenant}::uuid
            LEFT JOIN runtime_meta.entity_contract c ON c.id=d.entity_contract_id AND c.status='published' AND c.tenant_id IS NOT DISTINCT FROM ${tenant}::uuid
            LEFT JOIN runtime_meta.applied_release_payload p ON p.applied_release_id=a.id AND p.artifact_kind='compiled_entity_runtime' AND p.tenant_id IS NOT DISTINCT FROM ${tenant}::uuid
           WHERE h.applied_release_id=${head.applied_release_id}::uuid
        `.execute(tx);
            if (result.rows.length === 0)
              throw Error("ENTITY_READINESS_INVENTORY_INCOMPLETE");
            inventory.push(...result.rows);
          }
          return inventory;
        });
      for (const row of rows)
        descriptors.push(...readinessInventoryDescriptors(row, plane));
    }
    return descriptors;
  };
}

/** Same descriptor parsers as request admission; no compilation or preview fallback. */
export function readinessInventoryDescriptors(
  row: InventoryRow,
  plane: PlaneKey,
): readonly EntityRuntimeDescriptor[] {
  if (row.artifact_kind === "entity_runtime") {
    if (!row.descriptor) throw Error("ENTITY_READINESS_INVENTORY_INCOMPLETE");
    // Other established descriptor kinds are outside this Entity runtime contract.
    if (
      [
        "entity_case_runtime",
        "entity_notifications",
        "collection_configuration",
      ].includes(row.descriptor_kind ?? "")
    )
      return [];
    if (row.descriptor_kind !== "entity_runtime")
      throw Error("ENTITY_READINESS_INVENTORY_INCOMPLETE");
    const descriptor = parseEntityRuntimeDescriptor(row.descriptor);
    if (
      descriptor.planeKey !== plane ||
      descriptor.releaseId !== row.source_release_id ||
      descriptor.releaseNo !== Number(row.source_release_no)
    )
      throw Error("ENTITY_READINESS_INVENTORY_COORDINATE_MISMATCH");
    return [descriptor];
  }
  if (
    !row.payload ||
    typeof row.payload !== "object" ||
    Array.isArray(row.payload)
  )
    throw Error("ENTITY_READINESS_INVENTORY_INCOMPLETE");
  const payload = row.payload as { release?: unknown; artifacts?: unknown };
  const release = parseCompiledEntityReleaseEnvelope(payload.release);
  if (
    !release.targetPlanes.includes(plane) ||
    !Array.isArray(payload.artifacts)
  )
    throw Error("ENTITY_READINESS_INVENTORY_COORDINATE_MISMATCH");
  const parsed = payload.artifacts.map((raw) => {
    const value =
      raw && typeof raw === "object" && "content" in raw ? raw.content : raw;
    return parseCompiledEntityArtifact(value);
  });
  const required = release.artifacts.filter(
    (entry) => entry.artifactType === "runtime_contract",
  );
  return required.map((entry) => {
    const matches = parsed.filter(
      (artifact) =>
        artifact.artifactKey === entry.artifactKey && artifact.plane === plane,
    );
    if (
      matches.length !== 1 ||
      matches[0]!.artifactHash !== entry.hash ||
      matches[0]!.entityCode !== entry.entityCode
    )
      throw Error("ENTITY_READINESS_INVENTORY_INCOMPLETE");
    return parseCompiledRuntimeContract(matches[0]!, {
      releaseId: row.source_release_id,
      releaseNo: Number(row.source_release_no),
    });
  });
}
