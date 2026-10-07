import { sql, type Transaction } from "kysely";
import {
  AuthoringPolicyError,
  AuthoringConflictError,
  referenceUuid,
  validateFoundationNode,
  type MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  fingerprintCommand,
  parseIdempotencyKey,
} from "@athyper/server-contract-events";
import { canonicalJson, sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
import {
  validateLegacyFieldIdentityPlan,
  type LegacyReleaseCorrespondence,
} from "./legacy-field-lineage.js";
import { loadNormalizedLabels } from "./normalized-label-storage.js";
import { loadFieldIdentities } from "./normalized-reference-storage.js";
import { prepareLegacySourceEnrollment } from "./legacy-source-enrollment.js";
import type { LegacyOwnershipInput } from "./legacy-ownership-initialization.js";
type Tx = Transaction<Record<string, never>>;
export interface LegacyIdentityInstallationPolicy {
  readonly maximumBytes: number;
  readonly maximumReleases: number;
  readonly supportedLocales: readonly string[];
  readonly authoringSchemaHash: string;
  admit(tx: Tx, input: LegacyOwnershipInput): Promise<void>;
  /** Independently load an immutable named review and check current trust,
   * reviewer eligibility/independence and revocation. Never accept a request
   * DTO as this evidence. Declaration equality supplies no security authority. */
  resolveReview(
    tx: Tx,
    input: LegacyOwnershipInput,
    source: MetaEntityGraph,
  ): Promise<{
    reviewerId: string;
    reviewReference: string;
    reviewHash: string;
    reviewedPlanHash: string;
    releases: readonly LegacyReleaseCorrespondence[];
  }>;
  audit(
    tx: Tx,
    input: LegacyOwnershipInput,
    result: LegacyIdentityInstallationResult,
  ): Promise<void>;
}
export interface LegacyIdentityInstallationResult {
  readonly changeSetId: string;
  readonly revision: number;
  readonly planHash: string;
  readonly sourceHash: string;
  readonly targetHash: string;
  readonly reviewerId: string;
  readonly findings: ReturnType<
    typeof validateLegacyFieldIdentityPlan
  >["findings"];
  readonly bindings: readonly { fieldId: string; identityId: string }[];
  readonly replay: boolean;
}
const fail = (code: string): never => {
  throw new AuthoringPolicyError(
    code,
    "Reviewed identity installation evidence is unavailable or inconsistent.",
  );
};
export async function applyLegacyIdentityInstallation(
  tx: Tx,
  request: LegacyOwnershipInput,
  policy: LegacyIdentityInstallationPolicy,
  load: () => Promise<MetaEntityGraph>,
): Promise<LegacyIdentityInstallationResult> {
  if (!tx.isTransaction) fail("NORMALIZED_SAVE_TRANSACTION_REQUIRED");
  validateConversionJsonData(request, "/identityInstallation");
  const input = structuredClone(request);
  if (
    Object.keys(input).sort().join() !==
      "actorId,changeSetId,entityId,expectedRevision,expectedSourceHash,idempotencyKey,tenantId" ||
    input.tenantId !== null ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    !Number.isSafeInteger(input.expectedRevision + 1) ||
    !/^[a-f0-9]{64}$/.test(input.expectedSourceHash) ||
    !parseIdempotencyKey(input.idempotencyKey).ok
  )
    fail("LEGACY_IDENTITY_REQUEST_INVALID");
  for (const id of [input.entityId, input.changeSetId, input.actorId])
    validateFoundationNode(referenceUuid, id, "/identityInstallation/id");
  if (
    !policy?.admit ||
    !policy.resolveReview ||
    !policy.audit ||
    !Number.isSafeInteger(policy.maximumBytes) ||
    policy.maximumBytes < 1 ||
    !Number.isSafeInteger(policy.maximumReleases) ||
    policy.maximumReleases < 1 ||
    !/^[a-f0-9]{64}$/.test(policy.authoringSchemaHash)
  )
    fail("LEGACY_IDENTITY_POLICY_REQUIRED");
  const isolation = (
    await sql<{
      level: string;
    }>`SELECT current_setting('transaction_isolation') AS level`.execute(tx)
  ).rows[0]?.level;
  if (isolation !== "serializable")
    fail("LEGACY_IDENTITY_SERIALIZABLE_REQUIRED");
  await policy.admit(tx, structuredClone(input));
  const root = (
    await sql<{
      source: Record<string, unknown>;
    }>`SELECT to_jsonb(cs) AS source FROM metadata.entity_change_set cs JOIN metadata.entity e ON e.id=cs.entity_id WHERE cs.id=${input.changeSetId}::uuid AND cs.entity_id=${input.entityId}::uuid AND cs.tenant_id IS NULL AND e.tenant_id IS NULL AND e.ownership_model='system' FOR UPDATE OF cs`.execute(
      tx,
    )
  ).rows[0]?.source;
  if (
    !root ||
    root.source_kind !== "product" ||
    root.publication_owner !== "platform" ||
    root.authoring_schema_hash !== policy.authoringSchemaHash ||
    root.native_core_layout_version != null
  )
    fail("LEGACY_IDENTITY_OWNERSHIP_REQUIRED");
  const receipt = (
    await sql<{
      actor_id: string;
      request_hash: string;
      revision: string;
      identities: Record<string, unknown>;
    }>`SELECT actor_id,request_hash,revision,identities FROM metadata.entity_authoring_command_receipt WHERE change_set_id=${input.changeSetId}::uuid AND tenant_id IS NULL AND idempotency_key=${input.idempotencyKey}`.execute(
      tx,
    )
  ).rows[0];
  const history = async (revision: number) => {
    const h = (
      await sql<{
        graph: MetaEntityGraph;
        graph_hash: string;
      }>`SELECT graph,graph_hash FROM snapshot.entity_draft_save WHERE change_set_id=${input.changeSetId}::uuid AND tenant_id IS NULL AND lock_version=${revision}`.execute(
        tx,
      )
    ).rows[0];
    if (!h || sha256(h.graph) !== h.graph_hash)
      fail("LEGACY_IDENTITY_HISTORY_INVALID");
    return h!;
  };
  const source = receipt
    ? (await history(input.expectedRevision)).graph
    : await load();
  if (
    sha256(source) !== input.expectedSourceHash ||
    ![
      "athyper.meta-entity-contract/2.1",
      "athyper.meta-entity-contract/2.2",
    ].includes(source.contractSchema)
  )
    fail("LEGACY_IDENTITY_SOURCE_MISMATCH");
  const review = structuredClone(
    await policy.resolveReview(
      tx,
      structuredClone(input),
      structuredClone(source),
    ),
  );
  validateFoundationNode(
    referenceUuid,
    review.reviewerId,
    "/review/reviewerId",
  );
  if (
    review.reviewerId === input.actorId ||
    typeof review.reviewReference !== "string" ||
    !review.reviewReference.trim() ||
    review.reviewReference.length > 1024 ||
    !/^[a-f0-9]{64}$/.test(review.reviewHash)
  )
    fail("LEGACY_IDENTITY_INDEPENDENT_REVIEW_REQUIRED");
  const releases = (
    await sql<{
      releaseId: string;
      graph: MetaEntityGraph;
      integrity: boolean;
    }>`SELECT r.id AS "releaseId",v.contract_json AS graph,coalesce(v.validation_status='valid' AND v.contract_hash=r.contract_hash AND v.contract_hash=snapshot.fn_compute_entity_contract_hash(v.contract_json),false) AS integrity FROM metadata.entity_release r LEFT JOIN snapshot.entity_contract_revision v ON v.id=r.revision_id AND v.entity_id=r.entity_id AND v.tenant_id IS NOT DISTINCT FROM r.tenant_id WHERE r.entity_id=${input.entityId}::uuid AND r.tenant_id IS NULL ORDER BY r.id LIMIT ${policy.maximumReleases + 1}`.execute(
      tx,
    )
  ).rows;
  if (
    releases.length > policy.maximumReleases ||
    releases.some((r) => !r.integrity) ||
    releases.reduce(
      (n, r) => n + Buffer.byteLength(canonicalJson(r.graph)),
      Buffer.byteLength(canonicalJson(source)),
    ) > policy.maximumBytes
  )
    fail("LEGACY_IDENTITY_RELEASE_EVIDENCE_INVALID");
  const plan = validateLegacyFieldIdentityPlan(source, releases, {
    currentSourceHash: input.expectedSourceHash,
    releases: review.releases,
  });
  if (
    plan.planHash !== review.reviewedPlanHash ||
    plan.findings.some((f) => f.compatibility === "unknown")
  )
    fail("LEGACY_IDENTITY_REVIEW_PLAN_MISMATCH");
  const requestHash = fingerprintCommand({
    kind: "legacy-identity-installation",
    ...input,
    authoringSchemaHash: policy.authoringSchemaHash,
    planHash: plan.planHash,
    reviewerId: review.reviewerId,
    reviewReference: review.reviewReference,
    reviewHash: review.reviewHash,
  });
  const revision = input.expectedRevision + 1;
  if (receipt) {
    if (
      receipt.actor_id !== input.actorId ||
      receipt.request_hash !== requestHash ||
      Number(receipt.revision) !== revision
    )
      throw new AuthoringConflictError(
        "Identity command conflicts with its reviewed source.",
      );
    const target = await history(revision);
    const saved = receipt.identities;
    if (
      root!.reference_contract_version !== 1 ||
      saved.kind !== "legacy-identity-installation" ||
      saved.planHash !== plan.planHash ||
      saved.sourceHash !== input.expectedSourceHash ||
      saved.targetHash !== target.graph_hash ||
      target.graph.contractSchema !== "athyper.meta-entity-contract/2.3" ||
      !Array.isArray(saved.bindings) ||
      canonicalJson(saved.findings) !== canonicalJson(plan.findings)
    )
      fail("LEGACY_IDENTITY_REPLAY_INVALID");
    const expectedBindings = target.graph.fields
      .map((field) => {
        const matches =
          target.graph.fieldIdentities?.filter(
            (identity) => identity.fieldKey === field.fieldKey,
          ) ?? [];
        if (!field.id || matches.length !== 1)
          fail("LEGACY_IDENTITY_REPLAY_INVALID");
        return { fieldId: field.id!, identityId: matches[0]!.id };
      })
      .sort((a, b) => a.fieldId.localeCompare(b.fieldId));
    if (canonicalJson(saved.bindings) !== canonicalJson(expectedBindings))
      fail("LEGACY_IDENTITY_REPLAY_INVALID");
    const result: LegacyIdentityInstallationResult = {
      changeSetId: input.changeSetId,
      revision,
      sourceHash: input.expectedSourceHash,
      targetHash: target.graph_hash,
      planHash: plan.planHash,
      reviewerId: review.reviewerId,
      bindings: saved.bindings as { fieldId: string; identityId: string }[],
      findings: plan.findings,
      replay: true,
    };
    await policy.audit(tx, input, result);
    return result;
  }
  if (Number(root!.lock_version) !== input.expectedRevision)
    throw new AuthoringConflictError("Stale identity installation revision.");
  if (
    !["draft", "rejected"].includes(String(root!.status)) ||
    root!.reference_contract_version != null
  )
    fail("LEGACY_IDENTITY_SOURCE_NOT_EDITABLE");
  const fields = (
    await sql<{
      id: string;
      field_key: string;
      field_identity_id: string | null;
    }>`SELECT id,field_key,field_identity_id FROM metadata.entity_field WHERE change_set_id=${input.changeSetId}::uuid AND entity_id=${input.entityId}::uuid AND tenant_id IS NULL ORDER BY id FOR UPDATE`.execute(
      tx,
    )
  ).rows;
  if (
    fields.length !== source.fields.length ||
    fields.some(
      (f) =>
        f.field_identity_id !== null ||
        !source.fields.some((s) => s.id === f.id && s.fieldKey === f.field_key),
    )
  )
    fail("LEGACY_IDENTITY_FIELD_INVENTORY_INVALID");
  if (
    (
      await sql`SELECT id FROM metadata.entity_field_identity WHERE entity_id=${input.entityId}::uuid AND tenant_id IS NULL LIMIT 1`.execute(
        tx,
      )
    ).rows.length
  )
    fail("LEGACY_IDENTITY_EXISTING_CATALOGUE_REQUIRES_RECONCILIATION");
  async function capture(
    version: number,
    graph: MetaEntityGraph,
    kind: "previous" | "saved",
  ) {
    await sql`INSERT INTO snapshot.entity_draft_save(change_set_id,lock_version,tenant_id,graph,graph_hash,captured_by,capture_kind) VALUES(${input.changeSetId}::uuid,${version},NULL,${canonicalJson(graph)}::jsonb,${sha256(graph)},${input.actorId}::uuid,${kind}) ON CONFLICT(change_set_id,lock_version) DO NOTHING`.execute(
      tx,
    );
    if ((await history(version)).graph_hash !== sha256(graph))
      fail("LEGACY_IDENTITY_HISTORY_INVALID");
  }
  await capture(input.expectedRevision, source, "previous");
  const advanced = (
    await sql<{
      revision: string;
    }>`SELECT metadata.fn_advance_entity_change_set(${input.changeSetId}::uuid,${input.expectedRevision},${input.actorId}::uuid) AS revision`.execute(
      tx,
    )
  ).rows[0];
  if (Number(advanced?.revision) !== revision)
    fail("LEGACY_IDENTITY_REVISION_INVALID");
  const bindings: { fieldId: string; identityId: string }[] = [];
  for (const field of fields) {
    const identity = (
      await sql<{
        id: string;
      }>`INSERT INTO metadata.entity_field_identity(entity_id,tenant_id,field_key,identity_status,introduced_change_set_id,created_by) VALUES(${input.entityId}::uuid,NULL,${field.field_key},'reserved',${input.changeSetId}::uuid,${input.actorId}::uuid) RETURNING id`.execute(
        tx,
      )
    ).rows[0]!;
    const updated =
      await sql`UPDATE metadata.entity_field SET field_identity_id=${identity.id}::uuid,updated_by=${input.actorId}::uuid,updated_at=clock_timestamp() WHERE id=${field.id}::uuid AND change_set_id=${input.changeSetId}::uuid AND field_identity_id IS NULL RETURNING id`.execute(
        tx,
      );
    if (updated.rows.length !== 1) fail("LEGACY_IDENTITY_FIELD_WRITE_DENIED");
    bindings.push({ fieldId: field.id, identityId: identity.id });
  }
  const labels = await loadNormalizedLabels(tx, input.changeSetId);
  if (!labels) fail("LEGACY_IDENTITY_LABELS_REQUIRED");
  const proof = prepareLegacySourceEnrollment(source, {
    sourceHash: input.expectedSourceHash,
    revision: input.expectedRevision,
    sourceKind: "product",
    maximumBytes: policy.maximumBytes,
    context: {
      entityId: input.entityId,
      changeSetId: input.changeSetId,
      tenantId: null,
      supportedLocales: policy.supportedLocales,
    },
    labels: labels!,
    identities: await loadFieldIdentities(tx, input.changeSetId),
  });
  await sql`UPDATE metadata.entity_change_set SET reference_contract_version=1 WHERE id=${input.changeSetId}::uuid AND lock_version=${revision}`.execute(
    tx,
  );
  const target = await load();
  if (canonicalJson(target) !== canonicalJson(proof.candidate))
    fail("LEGACY_IDENTITY_READBACK_MISMATCH");
  await sql`SELECT metadata.validate_reference_members(${input.changeSetId}::uuid)`.execute(
    tx,
  );
  await capture(revision, target, "saved");
  const result: LegacyIdentityInstallationResult = {
    changeSetId: input.changeSetId,
    revision,
    sourceHash: input.expectedSourceHash,
    targetHash: sha256(target),
    planHash: plan.planHash,
    reviewerId: review.reviewerId,
    bindings,
    findings: plan.findings,
    replay: false,
  };
  const evidence = {
    kind: "legacy-identity-installation",
    ...result,
    reviewReference: review.reviewReference,
    reviewHash: review.reviewHash,
  };
  await sql`INSERT INTO metadata.entity_authoring_command_receipt(change_set_id,tenant_id,actor_id,idempotency_key,request_hash,expected_revision,revision,changed,identities) VALUES(${input.changeSetId}::uuid,NULL,${input.actorId}::uuid,${input.idempotencyKey},${requestHash},${input.expectedRevision},${revision},true,${canonicalJson(evidence)}::jsonb)`.execute(
    tx,
  );
  await policy.audit(tx, input, result);
  return result;
}
