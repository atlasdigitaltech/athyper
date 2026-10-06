import { sql, type Kysely } from "kysely";
import {
  AuthoringConflictError,
  AuthoringPolicyError,
  parseLabelCommands,
  ownedLabelMappings,
  type OwnedLabelGraph,
  type NormalizedAuthoringPolicy,
  type LabelCommandResult,
} from "@athyper/server-contract-meta-entity-authoring";
import { applyLabelCommands } from "./label-command-reducer.js";
import {
  ownedLabelRows,
  loadOwnedLabelRows,
  encodeOwnedLabels,
} from "./owned-label-codec.js";
import {
  parseIdempotencyKey,
  fingerprintCommand,
} from "@athyper/server-contract-events";
type DB = Kysely<Record<string, never>>;
interface Root {
  id: string;
  entity_id: string;
  tenant_id: string | null;
  lock_version: string;
  status: string;
  default_locale?: string | null;
  required_locales?: string[] | null;
}
export async function loadNormalizedLabels(
  db: DB,
  changeSetId: string,
): Promise<OwnedLabelGraph | null> {
  // to_jsonb preserves compatibility for legacy deployments lacking the new columns.
  const root = (
    await sql<{
      value: Root;
    }>`SELECT to_jsonb(cs) AS value FROM metadata.entity_change_set cs WHERE id=${changeSetId}::uuid`.execute(
      db,
    )
  ).rows[0]?.value;
  if (!root)
    throw new AuthoringPolicyError(
      "AUTHORING_DRAFT_NOT_FOUND",
      "Draft is unavailable",
    );
  if (!root.default_locale) return null;
  const context = {
    entityId: root.entity_id,
    changeSetId,
    tenantId: root.tenant_id,
    supportedLocales: root.required_locales ?? [],
  };
  const rows: Record<string, readonly Record<string, unknown>[]> = {};
  for (const mapping of Object.values(ownedLabelMappings)) {
    const columns = [
      "entity_id",
      "change_set_id",
      "tenant_id",
      ...Object.values(mapping.columns),
    ];
    rows[mapping.table] = (
      await sql<
        Record<string, unknown>
      >`SELECT ${sql.join(columns.map((c) => sql.ref(c)))} FROM ${sql.table(mapping.table)} WHERE change_set_id=${changeSetId}::uuid AND entity_id=${root.entity_id}::uuid AND tenant_id IS NOT DISTINCT FROM ${root.tenant_id}::uuid ORDER BY id`.execute(
        db,
      )
    ).rows;
  }
  return loadOwnedLabelRows(
    rows,
    {
      defaultLocale: root.default_locale,
      requiredLocales: root.required_locales ?? [],
    },
    context,
  );
}

export async function saveLabelCommands(
  db: DB,
  input: {
    changeSetId: string;
    actorId: string;
    tenantId: string | null;
    batch: unknown;
  },
  policy: NormalizedAuthoringPolicy,
  snapshot: (revision: number, kind: "previous" | "saved") => Promise<void>,
): Promise<LabelCommandResult> {
  const batch = parseLabelCommands(input.batch, policy);
  if (!parseIdempotencyKey(batch.idempotencyKey).ok)
    throw new AuthoringPolicyError(
      "AUTHORING_IDEMPOTENCY_KEY_INVALID",
      "A valid command identity is required",
    );
  const root = (
    await sql<Root>`SELECT * FROM metadata.entity_change_set WHERE id=${input.changeSetId}::uuid FOR UPDATE`.execute(
      db,
    )
  ).rows[0];
  if (!root || root.tenant_id !== input.tenantId)
    throw new AuthoringPolicyError(
      "AUTHORING_DRAFT_NOT_FOUND",
      "Draft is unavailable",
    );
  const requestHash = fingerprintCommand({
    contract: batch.contract,
    changeSetId: input.changeSetId,
    tenantId: input.tenantId,
    actorId: input.actorId,
    batch,
  });
  const receipt = (
    await sql<{
      request_hash: string;
      actor_id: string;
      revision: string;
      changed: boolean;
      identities: Record<string, string>;
    }>`SELECT request_hash,actor_id,revision,changed,identities FROM metadata.entity_authoring_command_receipt WHERE change_set_id=${input.changeSetId}::uuid AND idempotency_key=${batch.idempotencyKey}`.execute(
      db,
    )
  ).rows[0];
  if (receipt) {
    if (
      receipt.request_hash !== requestHash ||
      receipt.actor_id !== input.actorId
    )
      throw new AuthoringPolicyError(
        "AUTHORING_IDEMPOTENCY_CONFLICT",
        "Command identity is already bound to another request",
      );
    return {
      changeSetId: input.changeSetId,
      revision: Number(receipt.revision),
      changed: receipt.changed,
      identities: receipt.identities,
    };
  }
  if (Number(root.lock_version) !== batch.expectedRevision)
    throw new AuthoringConflictError("Stale authoring revision");
  if (!["draft", "rejected"].includes(root.status))
    throw new AuthoringPolicyError(
      "AUTHORING_DRAFT_NOT_EDITABLE",
      "Draft is sealed or under review",
    );
  const before = await loadNormalizedLabels(db, root.id);
  const context = {
    entityId: root.entity_id,
    changeSetId: root.id,
    tenantId: root.tenant_id,
    supportedLocales: policy.supportedLocales,
  };
  const allocated: string[] = [];
  for (const command of batch.commands)
    if (command.kind === "addMember")
      allocated.push(
        (await sql<{ id: string }>`SELECT shared.uuidv7() AS id`.execute(db))
          .rows[0]!.id,
      );
  const { graph, identities } = applyLabelCommands(before, batch, context, () =>
    allocated.shift()!,
  );
  const changed =
    !before ||
    encodeOwnedLabels(before, context) !== encodeOwnedLabels(graph, context);
  const revision = batch.expectedRevision + Number(changed);
  if (changed) {
    const advanced = (
      await sql<{
        revision: string;
      }>`SELECT metadata.fn_advance_entity_change_set(${root.id}::uuid,${batch.expectedRevision},${input.actorId}::uuid) AS revision`.execute(
        db,
      )
    ).rows[0];
    if (Number(advanced?.revision) !== revision)
      throw new AuthoringConflictError("Revision advance failed");
    await snapshot(batch.expectedRevision, "previous");
    await sql`UPDATE metadata.entity_change_set SET default_locale=${graph.defaultLocale},required_locales=ARRAY[${sql.join(graph.requiredLocales.map((l) => sql`${l}`))}]::text[] WHERE id=${root.id}::uuid`.execute(
      db,
    );
    const oldRows = before ? ownedLabelRows(before, context) : {};
    const newRows = ownedLabelRows(graph, context);
    const mappings = Object.values(ownedLabelMappings);
    // Children are removed explicitly before their parents. External consumers
    // remain guarded by RESTRICT FKs; no cascade or delete-and-reinsert.
    for (const { table } of [...mappings].reverse()) {
      const next = new Set((newRows[table] ?? []).map((row) => row.id));
      for (const row of oldRows[table] ?? [])
        if (!next.has(row.id)) {
          const removed =
            await sql`DELETE FROM ${sql.table(table)} WHERE id=${row.id}::uuid AND change_set_id=${root.id}::uuid AND entity_id=${root.entity_id}::uuid AND tenant_id IS NOT DISTINCT FROM ${root.tenant_id}::uuid RETURNING id`.execute(
              db,
            );
          if (removed.rows.length !== 1)
            throw new AuthoringConflictError("Scoped label removal failed");
        }
    }
    await sql`SET CONSTRAINTS metadata.entity_label_key_uq DEFERRED`.execute(
      db,
    );
    for (const { table, columns } of mappings) {
      const previous = new Map(
        (oldRows[table] ?? []).map((row) => [row.id, row]),
      );
      for (const row of newRows[table] ?? []) {
        const old = previous.get(row.id);
        if (old) {
          const changes = Object.values(columns).filter(
            (column) => column !== "id" && row[column] !== old[column],
          );
          if (!changes.length) continue;
          const updated =
            await sql`UPDATE ${sql.table(table)} SET ${sql.join(changes.map((column) => sql`${sql.ref(column)}=${row[column]}`))},updated_by=${input.actorId}::uuid,updated_at=clock_timestamp() WHERE id=${row.id}::uuid AND change_set_id=${root.id}::uuid AND entity_id=${root.entity_id}::uuid AND tenant_id IS NOT DISTINCT FROM ${root.tenant_id}::uuid RETURNING id`.execute(
              db,
            );
          if (updated.rows.length !== 1)
            throw new AuthoringConflictError("Scoped label update failed");
        } else {
          const values = { ...row, created_by: input.actorId };
          await sql`INSERT INTO ${sql.table(table)} (${sql.join(Object.keys(values).map((c) => sql.ref(c)))}) VALUES (${sql.join(Object.values(values).map((v) => sql`${v}`))})`.execute(
            db,
          );
        }
      }
    }
    await sql`SET CONSTRAINTS metadata.entity_label_key_uq, metadata.label_locale_check, metadata.translation_locale_check, metadata.settings_locale_check IMMEDIATE`.execute(
      db,
    );
    await snapshot(revision, "saved");
  }
  await sql`INSERT INTO metadata.entity_authoring_command_receipt(change_set_id,tenant_id,actor_id,idempotency_key,request_hash,expected_revision,revision,changed,identities)
    VALUES(${root.id}::uuid,${root.tenant_id}::uuid,${input.actorId}::uuid,${batch.idempotencyKey},${requestHash},${batch.expectedRevision},${revision},${changed},${JSON.stringify(identities)}::jsonb)`.execute(
    db,
  );
  return { changeSetId: root.id, revision, changed, identities };
}
