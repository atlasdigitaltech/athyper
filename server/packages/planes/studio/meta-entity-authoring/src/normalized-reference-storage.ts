import { sql, type Kysely } from "kysely";
import {
  AuthoringConflictError,
  AuthoringPolicyError,
  referenceMembers,
  validateReferenceIdentity,
  referenceConstraintNames,
  emptyReferenceMembers,
  parseReferenceCommands,
  parseReferenceMembers,
  type ReferenceCommandPolicy,
  type ReferenceMemberKind,
  type ReferenceMemberGraph,
  type ReferenceAnchors,
  type ReferenceCommandResult,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  parseIdempotencyKey,
  fingerprintCommand,
} from "@athyper/server-contract-events";
import { applyReferenceCommands } from "./reference-command-reducer.js";
import { canonicalJson } from "./deterministic.js";
type DB = Kysely<Record<string, never>>;
type Row = Record<string, unknown>;
const kinds = Object.keys(referenceMembers) as ReferenceMemberKind[];
const normalize = (value: unknown): unknown =>
  value instanceof Date
    ? value.toISOString()
    : Array.isArray(value)
      ? value.map(normalize)
      : value;
// pg parses numeric[] through floating point and dates through local Date.
// Select canonical strings at the SQL boundary to preserve precision/calendar days.
const selectedColumn = (c: { column: string; sqlType: string }) => {
  const ref = sql.ref(c.column);
  let value = ref;
  if (c.sqlType === "numeric" || c.sqlType === "numeric[]")
    value = sql`${ref}::${sql.raw(c.sqlType.endsWith("[]") ? "text[]" : "text")}`;
  else if (c.sqlType === "date") value = sql`to_char(${ref},'YYYY-MM-DD')`;
  else if (c.sqlType === "timestamptz")
    value = sql`to_char(${ref} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
  else if (c.sqlType === "date[]" || c.sqlType === "timestamptz[]")
    value = sql`CASE WHEN ${ref} IS NULL THEN NULL ELSE ARRAY(SELECT ${c.sqlType === "date[]" ? sql`to_char(item,'YYYY-MM-DD')` : sql`to_char(item AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`} FROM unnest(${ref}) WITH ORDINALITY AS source(item,ordinal) ORDER BY ordinal) END`;
  return sql`${value} AS ${sql.ref(c.column)}`;
};
export async function loadReferenceMembers(
  db: DB,
  id: string,
): Promise<ReferenceMemberGraph> {
  const members: Record<string, Row[]> = {};
  for (const kind of kinds) {
    const d = referenceMembers[kind];
    const raw = (
      await sql<Row>`SELECT id,${sql.join(Object.values(d.columns).map(selectedColumn))} FROM ${sql.table("metadata." + d.table)} WHERE change_set_id=${id}::uuid ORDER BY id`.execute(
        db,
      )
    ).rows;
    members[kind] = raw.map((r) => ({
      id: r.id,
      ...Object.fromEntries(
        Object.entries(d.columns).map(([p, c]) => [p, normalize(r[c.column])]),
      ),
    }));
  }
  return {
    contract: "entity.authoring-reference-members/1",
    members,
  } as unknown as ReferenceMemberGraph;
}
export async function readReferenceAnchors(
  db: DB,
  id: string,
  policy: ReferenceCommandPolicy,
): Promise<ReferenceAnchors> {
  const tables: Record<string, Row[]> = {};
  for (const table of [
    "entity_field",
    "entity_operation",
    "entity_surface",
    "entity_surface_field_binding",
    "entity_surface_section",
    "entity_surface_operation",
    "entity_label",
  ])
    tables[table] = (
      await sql<Row>`SELECT * FROM ${sql.table("metadata." + table)} WHERE change_set_id=${id}::uuid ORDER BY id`.execute(
        db,
      )
    ).rows;
  return {
    changeSetId: id,
    tables,
    maxMembers: policy.maxMembers,
    maxPredicateDepth: policy.maxPredicateDepth,
  };
}
export async function saveReferenceCommands(
  db: DB,
  input: {
    changeSetId: string;
    tenantId: string | null;
    actorId: string;
    batch: unknown;
  },
  policy: ReferenceCommandPolicy,
  snapshot: (revision: number, kind: "previous" | "saved") => Promise<void>,
): Promise<ReferenceCommandResult> {
  const b = parseReferenceCommands(input.batch, policy);
  if (!parseIdempotencyKey(b.idempotencyKey).ok)
    throw new AuthoringPolicyError(
      "AUTHORING_IDEMPOTENCY_KEY_INVALID",
      "Valid command identity required",
    );
  const root = (
    await sql<{
      id: string;
      tenant_id: string | null;
      entity_id: string;
      status: string;
      lock_version: string;
      reference_contract_version: number | null;
    }>`SELECT * FROM metadata.entity_change_set WHERE id=${input.changeSetId}::uuid FOR UPDATE`.execute(
      db,
    )
  ).rows[0];
  if (!root || root.tenant_id !== input.tenantId)
    throw new AuthoringPolicyError(
      "AUTHORING_DRAFT_NOT_FOUND",
      "Draft unavailable",
    );
  const hash = fingerprintCommand({
    actorId: input.actorId,
    tenantId: input.tenantId,
    changeSetId: root.id,
    batch: b,
  });
  const receipt = (
    await sql<{
      request_hash: string;
      actor_id: string;
      revision: string;
      changed: boolean;
      identities: Record<string, string>;
    }>`SELECT request_hash,actor_id,revision,changed,identities FROM metadata.entity_authoring_command_receipt WHERE change_set_id=${root.id}::uuid AND idempotency_key=${b.idempotencyKey}`.execute(
      db,
    )
  ).rows[0];
  if (receipt) {
    if (receipt.request_hash !== hash || receipt.actor_id !== input.actorId)
      throw new AuthoringPolicyError(
        "AUTHORING_IDEMPOTENCY_CONFLICT",
        "Command already bound",
      );
    return {
      changeSetId: root.id,
      revision: Number(receipt.revision),
      changed: receipt.changed,
      identities: receipt.identities,
    };
  }
  if (Number(root.lock_version) !== b.expectedRevision)
    throw new AuthoringConflictError("Stale draft revision");
  if (!["draft", "rejected"].includes(root.status))
    throw new AuthoringPolicyError(
      "AUTHORING_DRAFT_NOT_EDITABLE",
      "Draft is sealed",
    );
  const anchors = await readReferenceAnchors(db, root.id, policy);
  const before = root.reference_contract_version
    ? await loadReferenceMembers(db, root.id)
    : emptyReferenceMembers();
  const allocations: string[] = [];
  for (const c of b.commands)
    if (c.kind === "addMember" || c.kind === "reserveFieldIdentity")
      allocations.push(
        (await sql<{ id: string }>`SELECT shared.uuidv7() AS id`.execute(db))
          .rows[0]!.id,
      );
  const { graph, identities } = applyReferenceCommands(before, b, anchors, () =>
    allocations.shift()!,
  );
  const reservations = b.commands.filter(
    (c) => c.kind === "reserveFieldIdentity",
  );
  for (const c of reservations) {
    if (!anchors.tables.entity_field?.some((f) => f.id === c.fieldId))
      throw new AuthoringPolicyError(
        "REFERENCE_FOREIGN_MEMBER",
        "Field unavailable",
      );
    if (
      (
        await sql`SELECT 1 FROM metadata.entity_release WHERE entity_id=${root.entity_id}::uuid AND tenant_id IS NOT DISTINCT FROM ${root.tenant_id}::uuid LIMIT 1`.execute(
          db,
        )
      ).rows.length
    )
      throw new AuthoringPolicyError(
        "F9_IDENTITY_SOURCE_REQUIRED",
        "Existing released fields require verified identity lineage",
      );
    const field = anchors.tables.entity_field!.find((f) => f.id === c.fieldId)!;
    if (field.field_identity_id)
      throw new AuthoringPolicyError(
        "REFERENCE_IDENTITY_ALREADY_BOUND",
        "Stable identity already assigned",
      );
  }
  const changed =
    canonicalJson(before) !== canonicalJson(graph) || reservations.length > 0;
  const revision = b.expectedRevision + Number(changed);
  if (changed) {
    if (!Number.isSafeInteger(revision))
      throw new AuthoringPolicyError(
        "AUTHORING_REVISION_EXHAUSTED",
        "Revision bound exceeded",
      );
    const advanced = (
      await sql<{
        revision: string;
      }>`SELECT metadata.fn_advance_entity_change_set(${root.id}::uuid,${b.expectedRevision},${input.actorId}::uuid) AS revision`.execute(
        db,
      )
    ).rows[0];
    if (Number(advanced?.revision) !== revision)
      throw new AuthoringConflictError("Revision advance failed");
    await snapshot(b.expectedRevision, "previous");
    await sql`UPDATE metadata.entity_change_set SET reference_contract_version=1 WHERE id=${root.id}::uuid`.execute(
      db,
    );
    const deferred = referenceConstraintNames();
    await sql
      .raw("SET CONSTRAINTS " + deferred.join(",") + " DEFERRED")
      .execute(db);
    // All FKs are deferred to apply explicit remaps and removals as one final graph.
    // RESTRICT never silently removes a dependency; absent final references reject.

    for (const kind of [...kinds].reverse())
      for (const row of before.members[kind])
        if (!graph.members[kind].some((r) => r.id === row.id)) {
          const result =
            await sql`DELETE FROM ${sql.table("metadata." + referenceMembers[kind].table)} WHERE id=${row.id}::uuid AND change_set_id=${root.id}::uuid AND tenant_id IS NOT DISTINCT FROM ${root.tenant_id}::uuid AND entity_id=${root.entity_id}::uuid RETURNING id`.execute(
              db,
            );
          if (result.rows.length !== 1)
            throw new AuthoringConflictError("Scoped removal failed");
        }
    for (const c of reservations) {
      const field = anchors.tables.entity_field!.find(
        (f) => f.id === c.fieldId,
      )!;
      const id = identities[c.tempRef]!;
      await sql`INSERT INTO metadata.entity_field_identity(id,entity_id,tenant_id,field_key,identity_status,introduced_change_set_id,created_by) VALUES(${id}::uuid,${root.entity_id}::uuid,${root.tenant_id}::uuid,${field.field_key},'reserved',${root.id}::uuid,${input.actorId}::uuid)`.execute(
        db,
      );
      await sql`UPDATE metadata.entity_field SET field_identity_id=${id}::uuid,updated_at=clock_timestamp(),updated_by=${input.actorId}::uuid WHERE id=${c.fieldId}::uuid AND change_set_id=${root.id}::uuid`.execute(
        db,
      );
    }
    for (const kind of kinds) {
      const descriptor = referenceMembers[kind];
      for (const row of graph.members[kind]) {
        const old = before.members[kind].find((r) => r.id === row.id);
        const values = Object.fromEntries(
          Object.entries(descriptor.columns).map(([p, c]) => [
            c.column,
            Reflect.get(row, p),
          ]),
        );
        if (old) {
          const patches = Object.entries(descriptor.columns)
            .filter(
              ([p]) =>
                canonicalJson(Reflect.get(old, p)) !==
                canonicalJson(Reflect.get(row, p)),
            )
            .map(([p, c]) => [c.column, Reflect.get(row, p)] as const);
          if (!patches.length) continue;
          const result =
            await sql`UPDATE ${sql.table("metadata." + descriptor.table)} SET ${sql.join(patches.map(([c, v]) => sql`${sql.ref(c)}=${v}`))},updated_at=clock_timestamp(),updated_by=${input.actorId}::uuid WHERE id=${row.id}::uuid AND change_set_id=${root.id}::uuid AND entity_id=${root.entity_id}::uuid AND tenant_id IS NOT DISTINCT FROM ${root.tenant_id}::uuid RETURNING id`.execute(
              db,
            );
          if (result.rows.length !== 1)
            throw new AuthoringConflictError("Scoped update failed");
        } else {
          const insert = {
            id: row.id,
            tenant_id: root.tenant_id,
            entity_id: root.entity_id,
            change_set_id: root.id,
            ...values,
            created_by: input.actorId,
          };
          await sql`INSERT INTO ${sql.table("metadata." + descriptor.table)}(${sql.join(Object.keys(insert).map((c) => sql.ref(c)))}) VALUES(${sql.join(Object.values(insert).map((v) => sql`${v}`))})`.execute(
            db,
          );
        }
      }
    }
    await sql`SELECT metadata.validate_reference_members(${root.id}::uuid)`.execute(
      db,
    );
    await sql
      .raw("SET CONSTRAINTS " + deferred.join(",") + " IMMEDIATE")
      .execute(db);
    await snapshot(revision, "saved");
  }
  await sql`INSERT INTO metadata.entity_authoring_command_receipt(change_set_id,tenant_id,actor_id,idempotency_key,request_hash,expected_revision,revision,changed,identities) VALUES(${root.id}::uuid,${root.tenant_id}::uuid,${input.actorId}::uuid,${b.idempotencyKey},${hash},${b.expectedRevision},${revision},${changed},${JSON.stringify(identities)}::jsonb)`.execute(
    db,
  );
  return { changeSetId: root.id, revision, changed, identities };
}

export async function loadFieldIdentities(
  db: DB,
  id: string,
): Promise<
  readonly import("@athyper/server-contract-meta-entity-authoring").ReferenceFieldIdentity[]
> {
  const rows = (
    await sql<
      import("@athyper/server-contract-meta-entity-authoring").ReferenceFieldIdentity
    >`SELECT i.id,to_char(i.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",i.created_by AS "createdBy",i.entity_id AS "entityId",i.tenant_id AS "tenantId",i.field_key AS "fieldKey",i.parent_identity_id AS "parentIdentityId",i.identity_status AS "identityStatus",i.introduced_change_set_id AS "introducedChangeSetId",i.first_release_id AS "firstReleaseId",to_char(i.retired_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "retiredAt",i.retired_by AS "retiredBy",i.retirement_release_id AS "retirementReleaseId",i.replacement_identity_id AS "replacementIdentityId" FROM metadata.entity_field_identity i JOIN metadata.entity_change_set cs ON cs.entity_id=i.entity_id AND cs.tenant_id IS NOT DISTINCT FROM i.tenant_id JOIN metadata.entity_field f ON f.field_identity_id=i.id AND f.change_set_id=cs.id WHERE cs.id=${id}::uuid ORDER BY i.id`.execute(
      db,
    )
  ).rows;
  rows.forEach(validateReferenceIdentity);
  return rows;
}
