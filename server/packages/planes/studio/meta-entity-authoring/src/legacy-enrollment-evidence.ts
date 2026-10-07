import { sql, type Transaction } from "kysely";
import {
  AuthoringPolicyError,
  referenceUuid,
  validateFoundationNode,
  type MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { KyselyMetaEntityAuthoringRepository } from "./kysely-authoring-repository.js";
import { loadNormalizedLabels } from "./normalized-label-storage.js";
import { loadFieldIdentities } from "./normalized-reference-storage.js";
import { canonicalJson, sha256, validateGraph } from "./deterministic.js";
import { prepareLegacySourceEnrollment } from "./legacy-source-enrollment.js";

export interface EnrollmentHistoryRow {
  readonly revision: number;
  readonly tenantId: string | null;
  readonly graph: MetaEntityGraph;
  readonly graphHash: string;
}
/** Integrity evidence only. Missing snapshots are not fabricated, and a passing
 * checksum never attests historical authorship, authority or native conversion. */
export function assessEnrollmentHistory(
  source: MetaEntityGraph,
  revision: number,
  tenantId: string | null,
  rows: readonly EnrollmentHistoryRow[],
) {
  const issues: string[] = [];
  const seen = new Set<number>();
  for (const row of rows) {
    if (
      !Number.isSafeInteger(row.revision) ||
      row.revision < 0 ||
      row.revision > revision ||
      seen.has(row.revision)
    )
      issues.push("ENROLLMENT_HISTORY_REVISION_INVALID");
    seen.add(row.revision);
    if (row.tenantId !== tenantId)
      issues.push("ENROLLMENT_HISTORY_SCOPE_INVALID");
    if (
      !/^[a-f0-9]{64}$/.test(row.graphHash) ||
      sha256(row.graph) !== row.graphHash
    )
      issues.push("ENROLLMENT_HISTORY_HASH_INVALID");
    if (row.revision === revision && sha256(source) !== row.graphHash)
      issues.push("ENROLLMENT_CURRENT_HISTORY_MISMATCH");
  }
  return {
    snapshotCount: rows.length,
    currentRevisionCaptured: seen.has(revision),
    integrity:
      rows.length === 0
        ? "no-snapshots"
        : issues.length
          ? "failed"
          : "verified",
    issues: [...new Set(issues)].sort(),
  } as const;
}
/** Operational diagnostic for an independently admitted database operator. This
 * read-only entry point supplies no application admission and must not be exposed
 * as an unauthenticated request API. Caller selects exact draft IDs, not names. */
export async function inspectLegacyEnrollmentEvidence(
  tx: Transaction<Record<string, never>>,
  changeSetId: string,
  limits: { maximumBytes: number; maximumHistoryRows: number },
) {
  const fail = (code: string): never => {
    throw new AuthoringPolicyError(
      code,
      "Read-only enrollment inspection requires exact bounded source evidence.",
    );
  };
  if (!tx.isTransaction) fail("ENROLLMENT_INSPECTION_TRANSACTION_REQUIRED");
  validateFoundationNode(referenceUuid, changeSetId, "/changeSetId");
  if (
    !Number.isSafeInteger(limits.maximumBytes) ||
    limits.maximumBytes < 1 ||
    !Number.isSafeInteger(limits.maximumHistoryRows) ||
    limits.maximumHistoryRows < 1
  )
    fail("ENROLLMENT_INSPECTION_BUDGET_INVALID");
  const mode = (
    await sql<{
      read_only: string;
      isolation: string;
    }>`SELECT current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation`.execute(
      tx,
    )
  ).rows[0];
  if (
    mode?.read_only !== "on" ||
    !["repeatable read", "serializable"].includes(mode.isolation)
  )
    fail("ENROLLMENT_INSPECTION_SNAPSHOT_REQUIRED");
  const root = (
    await sql<{
      id: string;
      entity_id: string;
      tenant_id: string | null;
      lock_version: string;
      source_kind: string | null;
      native_core_layout_version: number | null;
      reference_contract_version: number | null;
    }>`SELECT id,entity_id,tenant_id,lock_version,source_kind,native_core_layout_version,reference_contract_version FROM metadata.entity_change_set WHERE id=${changeSetId}::uuid`.execute(
      tx,
    )
  ).rows[0];
  if (!root) fail("AUTHORING_DRAFT_NOT_FOUND");
  if (
    root!.native_core_layout_version !== null ||
    root!.reference_contract_version !== null
  )
    fail("LEGACY_ENROLLMENT_VERSION_UNSUPPORTED");
  const revision = Number(root!.lock_version);
  if (!Number.isSafeInteger(revision) || revision < 0)
    fail("ENROLLMENT_INSPECTION_REVISION_INVALID");
  const repository = new KyselyMetaEntityAuthoringRepository(tx);
  const source = await repository.loadGraph(changeSetId);
  const bytes = Buffer.byteLength(canonicalJson(source));
  if (bytes > limits.maximumBytes)
    fail("ENROLLMENT_INSPECTION_SOURCE_TOO_LARGE");
  const history = (
    await sql<{
      revision: string;
      tenantId: string | null;
      graph: MetaEntityGraph;
      graphHash: string;
    }>`SELECT lock_version AS revision,tenant_id AS "tenantId",graph,graph_hash AS "graphHash" FROM snapshot.entity_draft_save WHERE change_set_id=${changeSetId}::uuid ORDER BY lock_version LIMIT ${limits.maximumHistoryRows + 1}`.execute(
      tx,
    )
  ).rows;
  if (
    history.length > limits.maximumHistoryRows ||
    history.reduce((n, r) => n + Buffer.byteLength(canonicalJson(r.graph)), 0) >
      limits.maximumBytes
  )
    fail("ENROLLMENT_INSPECTION_HISTORY_TOO_LARGE");
  const historyEvidence = assessEnrollmentHistory(
    source,
    revision,
    root!.tenant_id,
    history.map((r) => ({ ...r, revision: Number(r.revision) })),
  );
  const labels = await loadNormalizedLabels(tx, changeSetId);
  const identities = await loadFieldIdentities(tx, changeSetId);
  const validation = validateGraph(source);
  const blockers = [...historyEvidence.issues];
  if (validation.issues.length)
    blockers.push("LEGACY_ENROLLMENT_SOURCE_INVALID");
  if (!labels) blockers.push("LEGACY_ENROLLMENT_LABELS_NOT_ENROLLED");
  if (identities.length !== source.fields.length)
    blockers.push("LEGACY_ENROLLMENT_IDENTITIES_NOT_ENROLLED");
  if (!["product", "tenant_entity"].includes(root!.source_kind ?? ""))
    blockers.push("LEGACY_ENROLLMENT_SOURCE_OWNERSHIP_UNDECLARED");
  let targetHash: string | null = null;
  if (labels && blockers.length === 0) {
    try {
      targetHash = prepareLegacySourceEnrollment(source, {
        sourceHash: sha256(source),
        revision,
        sourceKind: root!.source_kind as "product" | "tenant_entity",
        context: {
          entityId: root!.entity_id,
          changeSetId,
          tenantId: root!.tenant_id,
          supportedLocales: labels.requiredLocales,
        },
        labels,
        identities,
        maximumBytes: limits.maximumBytes,
      }).targetHash;
    } catch (error) {
      if (error instanceof Error && "code" in error)
        blockers.push(String(error.code));
      else throw error;
    }
  }
  return {
    schema: "entity.legacy-enrollment-evidence/1",
    changeSetId,
    entityId: root!.entity_id,
    tenantId: root!.tenant_id,
    revision,
    sourceHash: sha256(source),
    contractSchema: source.contractSchema,
    sourceBytes: bytes,
    fieldCount: source.fields.length,
    identityCount: identities.length,
    labelCount: labels?.labels.length ?? 0,
    history: historyEvidence,
    validationIssues: validation.issues.map((i) => ({
      code: i.code,
      path: i.path,
    })),
    targetHash,
    blockers: [...new Set(blockers)].sort(),
    authority: "not-assessed",
    nativeConversion: "not-executed",
    deployedQualification: "not-established",
  } as const;
}
