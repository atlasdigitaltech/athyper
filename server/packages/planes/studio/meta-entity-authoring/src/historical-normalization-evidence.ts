import {
  compareHistoricalFieldCorrespondence,
  proposeHistoricalFieldCorrespondence,
  validateHistoricalFieldIdentityPlan,
} from "./historical-field-correspondence.js";
import { prepareHistoricalLabelNormalization } from "./historical-label-normalization.js";
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
import { prepareHistoricalSourceNormalization } from "./historical-source-normalization.js";

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
export async function inspectHistoricalNormalizationEvidence(
  tx: Transaction<Record<string, never>>,
  changeSetId: string,
  limits: { maximumBytes: number; maximumHistoryRows: number },
  labelPlan?: {
    declarations?: Parameters<
      typeof prepareHistoricalLabelNormalization
    >[1]["declarations"];
    defaultLocale: string;
    requiredLocales: readonly string[];
    policy: import("@athyper/server-contract-meta-entity-authoring").NormalizedAuthoringPolicy;
  },
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
  const releases = (
    await sql<{
      releaseId: string;
      revisionId: string;
      contractHash: string;
      graph: MetaEntityGraph;
      integrity: boolean;
    }>`
    SELECT r.id AS "releaseId",r.revision_id AS "revisionId",r.contract_hash AS "contractHash",v.contract_json AS graph,
     coalesce((v.validation_status='valid' AND v.contract_hash=r.contract_hash AND v.contract_hash=snapshot.fn_compute_entity_contract_hash(v.contract_json)),false) AS integrity
    FROM metadata.entity_release r LEFT JOIN snapshot.entity_contract_revision v ON v.id=r.revision_id AND v.entity_id=r.entity_id AND v.tenant_id IS NOT DISTINCT FROM r.tenant_id
    WHERE r.entity_id=${root!.entity_id}::uuid AND r.tenant_id IS NOT DISTINCT FROM ${root!.tenant_id}::uuid
    ORDER BY r.id LIMIT ${limits.maximumHistoryRows + 1}`.execute(tx)
  ).rows;
  if (
    releases.length > limits.maximumHistoryRows ||
    releases.reduce(
      (n, r) => n + Buffer.byteLength(canonicalJson(r.graph)),
      0,
    ) > limits.maximumBytes
  )
    fail("ENROLLMENT_INSPECTION_RELEASE_HISTORY_TOO_LARGE");
  const releaseLineage = releases.map((r) => ({
    releaseId: r.releaseId,
    revisionId: r.revisionId,
    contractHash: r.contractHash,
    integrity: r.integrity,
    ...(r.integrity
      ? {
          comparison: compareHistoricalFieldCorrespondence(source, r.graph),
          correspondenceProposal: proposeHistoricalFieldCorrespondence(
            source,
            r.graph,
          ),
        }
      : { blocker: "F9_RELEASE_SOURCE_INTEGRITY_INVALID" }),
  }));
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
      targetHash = prepareHistoricalSourceNormalization(source, {
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
  const labelMappingCandidates: {
    sourcePath: string;
    defaultText: string;
    labelKey: null;
  }[] = [];
  if (labelPlan) {
    const families = {
      fields: ["label"],
      surfaces: ["title"],
      surfaceSections: ["title"],
      surfaceFieldBindings: ["labelOverride", "helpText", "placeholder"],
      operations: ["label"],
    };
    for (const [family, properties] of Object.entries(families)) {
      const members = (source as unknown as Record<string, unknown>)[family];
      if (!Array.isArray(members)) continue;
      members.forEach((row: Record<string, unknown>, index) => {
        for (const key of properties)
          if (typeof row[key] === "string" && (row[key] as string).length)
            labelMappingCandidates.push({
              sourcePath: `/${family}/${index}/${key}`,
              defaultText: row[key] as string,
              labelKey: null,
            });
      });
    }
  }
  function labelProposal() {
    try {
      return {
        status: "prepared" as const,
        proposal: prepareHistoricalLabelNormalization(
          source,
          {
            sourceHash: sha256(source),
            revision,
            idempotencyKey: `legacy-labels:${changeSetId}:${sha256(source)}`,
            defaultLocale: labelPlan!.defaultLocale,
            requiredLocales: labelPlan!.requiredLocales,
            ...(labelPlan!.declarations
              ? { declarations: labelPlan!.declarations }
              : {}),
          },
          labelPlan!.policy,
        ),
      };
    } catch (error) {
      if (error instanceof Error && "code" in error)
        return {
          status: "blocked" as const,
          code: String(error.code),
          mappingCandidates: labelMappingCandidates,
        };
      throw error;
    }
  }
  const identityPlanProposal = releases.every((r) => r.integrity)
    ? validateHistoricalFieldIdentityPlan(
        source,
        releases.map((r) => ({ releaseId: r.releaseId, graph: r.graph })),
        {
          currentSourceHash: sha256(source),
          releases: releases.map((r) => {
            const proposal = proposeHistoricalFieldCorrespondence(
              source,
              r.graph,
            );
            return {
              releaseId: r.releaseId,
              previousSourceHash: proposal.previousSourceHash,
              mappings: proposal.mappings,
              rebindRequiredPreviousFieldIds: proposal.unmappedPreviousFieldIds,
            };
          }),
        },
      )
    : null;
  return {
    schema: "entity.historical-normalization-evidence/1",
    identityPlanProposal,
    ...(labelPlan ? { labelProposal: labelProposal() } : {}),
    changeSetId,
    entityId: root!.entity_id,
    tenantId: root!.tenant_id,
    revision,
    sourceHash: sha256(source),
    contractSchema: source.contractSchema,
    sourceBytes: bytes,
    fieldCount: source.fields.length,
    releaseLineage,
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
