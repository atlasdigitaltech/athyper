import { parseCollectionCapture } from "../snapshots/collection-capture.js";
import { createOwnedRecordHistoryAdapter } from "../owned-history-adapter.js";
import { createTransactionalRecordActionService } from "../actions/transactional-action-service.js";
import { randomUUID } from "node:crypto";
import { Kysely, sql, type Transaction } from "kysely";
import { expect } from "vitest";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  createRecordHistoryHook,
  qualifyRecordHistoryDescriptor,
  type RecordHistoryBinding,
  type RecordHistoryAdapter,
} from "../record-history.js";
import { createRecordMutationService } from "../mutation-service.js";
import { createKyselyRecordRepository } from "../kysely-record-repository.js";
import { createKyselyCommandExecutionStore } from "../kysely-command-execution-store.js";
import type { RecordTransactionCoordinator } from "@athyper/server-contract-records";

export async function exerciseRecordHistory(
  db: Kysely<Record<string, never>>,
  ddl: string,
) {
  await sql
    .raw(
      `DROP TRIGGER fail_complete ON event.command_execution;
    ${ddl}
    GRANT SELECT,INSERT ON snapshot.record_version TO activity_app;
    GRANT UPDATE,DELETE ON snapshot.record_version TO activity_app;
    CREATE TABLE master.example_record(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,name text NOT NULL,status text NOT NULL DEFAULT 'draft',row_version bigint NOT NULL DEFAULT 1);
    GRANT SELECT,INSERT,UPDATE,DELETE ON master.example_record TO activity_app;
    ALTER TABLE master.example_record ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant ON master.example_record TO activity_app USING(tenant_id=shared.current_tenant_id()) WITH CHECK(tenant_id=shared.current_tenant_id());
    CREATE TABLE event.history_effect(tenant_id uuid NOT NULL,kind text NOT NULL);
    GRANT INSERT ON event.history_effect TO activity_app;`,
    )
    .execute(db);
  let d: EntityRuntimeDescriptor = {
    schema: "athyper.entity-runtime-descriptor/1.0",
    entityCode: "example_record",
    planeKey: "neon",
    releaseId: randomUUID(),
    releaseNo: 1,
    contractHash: "a".repeat(64),
    compiledHash: "b".repeat(64),
    storage: {
      schema: "master",
      object: "example_record",
      idField: "id",
      tenantField: "tenant_id",
      versionField: "row_version",
      statusField: "status",
    },
    fields: [
      {
        key: "name",
        storagePath: "name",
        type: "string",
        required: true,
        writableOn: ["create", "patch"],
      },
      {
        key: "status",
        storagePath: "status",
        type: "string",
        required: false,
        writableOn: ["create"],
      },
    ],
    operations: {
      create: { code: "create", permissionCode: "example.create" },
      patch: { code: "patch", permissionCode: "example.patch" },
    },
    lifecycle: {
      transitions: [
        {
          code: "activate",
          from: ["draft"],
          to: "active",
          permissionCode: "example.activate",
        },
      ],
    },
  };
  let binding: RecordHistoryBinding = {
    providerKey: "platform.records.history.v1",
    fields: ["name", "status"],
    operations: ["create", "patch", "transition"],
    automaticCapture: "committed",
    captureOperations: ["create", "patch", "transition"],
    retentionClass: "standard",
  };
  const context = {
    tenantId: randomUUID(),
    principalId: randomUUID(),
    planeKey: "neon",
    requestId: randomUUID(),
  } as VerifiedRequestContext;
  const transactions: RecordTransactionCoordinator<
    Transaction<Record<string, never>>
  > = {
    run: async (plane, actor, work) =>
      db.transaction().execute(async (tx) => {
        await sql`SET LOCAL ROLE activity_app`.execute(tx);
        await sql`SELECT set_config('app.current_tenant_id',${actor.tenantId},true),set_config('app.current_principal_id',${actor.principalId},true),set_config('app.database_plane',${plane},true)`.execute(
          tx,
        );
        return work(tx);
      }),
  };
  const append = async (
    kind: string,
    tx: Transaction<Record<string, never>>,
  ) => {
    await sql`INSERT INTO event.history_effect VALUES(${context.tenantId}::uuid,${kind})`.execute(
      tx,
    );
  };
  const adapters = new Map<string, RecordHistoryAdapter>();
  const options = {
    metadata: { getEntityDescriptor: async () => d },
    authorizer: { authorize: async () => ({ allowed: true }) },
    transactions,
    repository: createKyselyRecordRepository({ databases: { neon: db } }),
    commandExecutions: createKyselyCommandExecutionStore(),
    history: createRecordHistoryHook({
      resolve: async () => binding,
      adapters,
    }),
    audit: {
      record: async (_input, tx) => {
        await append("audit", tx!);
        return {} as never;
      },
    },
    outbox: { append: async (_input, tx) => append("outbox", tx!) },
  } satisfies Parameters<
    typeof createRecordMutationService<Transaction<Record<string, never>>>
  >[0];
  const service = createRecordMutationService(options);
  const base = {
    context,
    entityCode: d.entityCode,
    origin: "classic" as const,
    validationMode: "strict" as const,
  };
  const create = {
    ...base,
    input: { name: "Original" },
    idempotencyKey: "history-create-00000001",
  };
  const first = await service.create(create);
  expect(first.kind).toBe("Committed");
  if (first.kind !== "Committed") throw Error("create failed");
  const recordId = first.recordId;
  const rows = async () =>
    (
      await sql<any>`SELECT * FROM snapshot.record_version WHERE entity_id=${recordId}::uuid ORDER BY source_record_version`.execute(
        db,
      )
    ).rows;
  expect(await rows()).toHaveLength(1);
  expect(await service.create(create)).toMatchObject({
    kind: "Committed",
    replayed: true,
  });
  expect(await rows()).toHaveLength(1);
  const patch = {
    ...base,
    recordId,
    expectedVersion: 1,
    input: { name: "Changed" },
    idempotencyKey: "history-patch-00000001",
  };
  const simultaneous = await Promise.all([
    service.patch(patch),
    service.patch(patch),
  ]);
  expect(
    simultaneous.filter((r) => r.kind === "Committed" && r.replayed),
  ).toHaveLength(1);
  expect(await rows()).toHaveLength(2);
  expect((await rows())[1]).toMatchObject({
    payload_json: { name: "Changed", status: "draft" },
    changed_fields: ["name"],
  });
  // An unchanged write may advance optimistic concurrency, but does not invent history.
  expect(
    await service.patch({
      ...patch,
      expectedVersion: 2,
      idempotencyKey: "history-noop-00000001",
    }),
  ).toMatchObject({ kind: "Committed" });
  expect(await rows()).toHaveLength(2);
  expect(
    await service.patch({
      ...patch,
      input: { name: "Stale" },
      idempotencyKey: "history-conflict-00000001",
    }),
  ).toMatchObject({ kind: "VersionConflict" });
  expect(await rows()).toHaveLength(2);
  const counts = async () =>
    (
      await sql<any>`SELECT (SELECT count(*) FROM snapshot.record_version)::int AS versions,(SELECT count(*) FROM snapshot.entity_snapshot_identity)::int AS snapshots,(SELECT count(*) FROM event.history_effect)::int AS effects`.execute(
        db,
      )
    ).rows[0];
  const initialCounts = await counts();
  // Fail the required snapshot after the row mutation and side effects.
  await sql
    .raw(
      `CREATE FUNCTION snapshot.reject_history_capture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.capture_source='record-history' THEN RAISE EXCEPTION 'required capture failed'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_history_capture BEFORE INSERT ON snapshot.entity_snapshot_identity FOR EACH ROW EXECUTE FUNCTION snapshot.reject_history_capture();`,
    )
    .execute(db);
  await expect(
    service.patch({
      ...patch,
      expectedVersion: 3,
      input: { name: "Rolled back" },
      idempotencyKey: "history-failure-00000001",
    }),
  ).rejects.toThrow("required capture failed");
  expect(await counts()).toEqual(initialCounts);
  expect(
    (
      await sql<any>`SELECT name,row_version::int AS version FROM master.example_record WHERE id=${recordId}::uuid`.execute(
        db,
      )
    ).rows[0],
  ).toEqual({ name: "Changed", version: 3 });
  expect(
    (
      await sql`SELECT id FROM event.command_execution WHERE idempotency_key='history-failure-00000001'`.execute(
        db,
      )
    ).rows,
  ).toHaveLength(0);
  await sql`DROP TRIGGER reject_history_capture ON snapshot.entity_snapshot_identity`.execute(
    db,
  );
  // Milestone capture is separate from recording; no manual-capture permission is checked.
  binding = {
    ...binding,
    automaticCapture: "milestone",
    captureOperations: ["transition.activate"],
  };
  await service.patch({
    ...patch,
    expectedVersion: 3,
    input: { name: "Milestone input" },
    idempotencyKey: "history-before-milestone-00000001",
  });
  expect((await rows()).at(-1).snapshot_id).toBeNull();
  await service.transition({
    ...base,
    recordId,
    expectedVersion: 4,
    transitionCode: "activate",
    input: {},
    idempotencyKey: "history-activate-00000001",
  });
  expect((await rows()).at(-1)).toMatchObject({
    operation: "transition",
    transition_code: "activate",
    payload_json: { name: "Milestone input", status: "active" },
  });
  expect((await rows()).at(-1).snapshot_id).toBeTruthy();
  const versionRows = await transactions.run("neon", context, (tx) =>
    sql`SELECT * FROM snapshot.record_version`.execute(tx),
  );
  expect(versionRows.rows).toHaveLength(4);
  for (const scope of [
    { ...context, tenantId: randomUUID() },
    { ...context, planeKey: "mesh" as const },
  ]) {
    const hidden = await transactions.run(scope.planeKey, scope, (tx) =>
      sql`SELECT * FROM snapshot.record_version`.execute(tx),
    );
    expect(hidden.rows).toHaveLength(0);
  }
  // Even an application connection with INSERT cannot forge tenant, plane or actor.
  for (const forged of [
    { tenantId: randomUUID(), plane: "neon", actor: context.principalId },
    { tenantId: context.tenantId, plane: "mesh", actor: context.principalId },
    { tenantId: context.tenantId, plane: "neon", actor: randomUUID() },
  ]) {
    await expect(
      transactions.run("neon", context, (tx) =>
        sql`INSERT INTO snapshot.record_version(tenant_id,plane_code,entity_type,entity_code,entity_id,source_record_version,actor_principal_id,operation,release_id,contract_hash,changed_fields,payload_json)
      VALUES(${forged.tenantId}::uuid,${forged.plane},'master.example_record','example_record',${randomUUID()}::uuid,1,${forged.actor}::uuid,'create',${d.releaseId}::uuid,${d.contractHash},ARRAY['name'],'{}'::jsonb)`.execute(
          tx,
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  }
  await expect(
    sql`UPDATE snapshot.record_version SET payload_json='{}'::jsonb`.execute(
      db,
    ),
  ).rejects.toThrow("immutable");
  await expect(
    sql`DELETE FROM snapshot.record_version`.execute(db),
  ).rejects.toThrow("immutable");
  expect(() =>
    qualifyRecordHistoryDescriptor(
      { ...d, storage: { ...d.storage, tenantField: undefined } },
      binding,
    ),
  ).toThrow();
  expect(() =>
    qualifyRecordHistoryDescriptor(
      {
        ...d,
        operations: {
          ...d.operations,
          delete: { code: "delete", permissionCode: "example.delete" },
        },
      },
      binding,
    ),
  ).toThrow();
  expect(() =>
    qualifyRecordHistoryDescriptor(d, { ...binding, fields: ["name"] }),
  ).toThrow("PROJECTION_INCOMPLETE");
  // Install a descriptor-owned aggregate adapter. Child-only changes must be
  // captured even when no projected root business field changes.
  await sql
    .raw(
      `CREATE TABLE master.example_child(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,parent_id uuid NOT NULL,label text NOT NULL);
    GRANT SELECT,INSERT,UPDATE,DELETE ON master.example_child TO activity_app;
    ALTER TABLE master.example_child ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant ON master.example_child TO activity_app USING(tenant_id=shared.current_tenant_id()) WITH CHECK(tenant_id=shared.current_tenant_id());`,
    )
    .execute(db);
  const adapter = createOwnedRecordHistoryAdapter({
    key: "test.owned.v1",
    qualify(descriptor) {
      if (descriptor.aggregate?.collections[0]?.code !== "lines")
        throw Error("COLLECTION_REQUIRED");
    },
    async resolveCollection() {
      return {
        descriptor: {
          ...d,
          entityCode: "example_child",
          storage: {
            schema: "master",
            object: "example_child",
            idField: "id",
            tenantField: "tenant_id",
          },
          fields: [
            {
              key: "id",
              storagePath: "id",
              type: "string",
              required: true,
              writableOn: [],
            },
            {
              key: "parent_id",
              storagePath: "parent_id",
              type: "string",
              required: true,
              writableOn: [],
            },
            {
              key: "label",
              storagePath: "label",
              type: "string",
              required: true,
              writableOn: ["create", "patch"],
            },
          ],
        },
        fields: ["id", "label"],

      };
    },
  });
  adapters.set(adapter.key, adapter);
  d = {
    ...d,
    operations: {
      ...d.operations,
      aggregate: { code: "aggregate", permissionCode: "example.aggregate" },
      delete: { code: "delete", permissionCode: "example.delete" },
    },
    aggregate: {
      collections: [
        {
          code: "lines",
          entityCode: "example_child",
          parentField: "parent_id",
          allowedOperations: ["create"],
        },
      ],
    },
    actions: [
      {
        code: "rename",
        handlerKey: "test.rename.v1",
        permissionCode: "example.rename",
      },
    ],
  };
  binding = {
    ...binding,
    adapterKey: adapter.key,
    collections: [{ maximumRecords: 100, definition: { key: "lines", sourceEntity: "example_child", sourceContract: d.contractHash, scope: "owned-active-lines.v1", identityField: "id", fields: [{key:"id",comparison:"json"},{key:"label",comparison:"json"}] } }],
    operations: [
      "create",
      "patch",
      "transition",
      "aggregate",
      "domain",
      "delete",
    ],
    automaticCapture: "committed",
    captureOperations: ["aggregate", "domain", "delete"],
  };
  const aggregate = createRecordMutationService<
    Transaction<Record<string, never>>
  >({
    ...options,
    aggregateExecutor: {
      async execute(_descriptor, command, tx) {
        for (const line of command.changes.collections.lines?.create ?? [])
          await sql`INSERT INTO master.example_child(tenant_id,parent_id,label) VALUES(${command.context.tenantId}::uuid,${command.recordId}::uuid,${String(line.label)})`.execute(
            tx,
          );
        return (
          (
            await sql<
              Record<string, unknown>
            >`UPDATE master.example_record SET row_version=row_version+1 WHERE tenant_id=${command.context.tenantId}::uuid AND id=${command.recordId}::uuid AND row_version=${command.expectedVersion} RETURNING *`.execute(
              tx,
            )
          ).rows[0] ?? null
        );
      },
    },
  });
  const aggregateCommand = {
    ...base,
    recordId,
    expectedVersion: 5,
    idempotencyKey: "history-aggregate-000001",
    planHash: "plan-1",
    changes: {
      header: { patch: {} },
      collections: { lines: { create: [{ label: "Line one" }] } },
    },
  };
  await sql
    .raw(
      `CREATE TRIGGER reject_history_capture BEFORE INSERT ON snapshot.entity_snapshot_identity FOR EACH ROW EXECUTE FUNCTION snapshot.reject_history_capture();`,
    )
    .execute(db);
  const beforeAggregate = await counts();
  await expect(aggregate.mutateAggregate(aggregateCommand)).rejects.toThrow(
    "required capture failed",
  );
  expect(await counts()).toEqual(beforeAggregate);
  expect(
    (await sql`SELECT id FROM master.example_child`.execute(db)).rows,
  ).toHaveLength(0);
  await sql`DROP TRIGGER reject_history_capture ON snapshot.entity_snapshot_identity`.execute(
    db,
  );
  const qualifiedCollections = binding.collections!;
  binding = { ...binding, collections: qualifiedCollections.map(item => ({...item, definition: {...item.definition, sourceContract: "b".repeat(64)}})) };
  await expect(aggregate.mutateAggregate(aggregateCommand)).rejects.toThrow();
  expect(await counts()).toEqual(beforeAggregate);
  expect((await sql`SELECT id FROM master.example_child`.execute(db)).rows).toHaveLength(0);
  binding = { ...binding, collections: qualifiedCollections };
  expect(await aggregate.mutateAggregate(aggregateCommand)).toMatchObject({
    kind: "Committed",
  });
  expect((await rows()).at(-1)).toMatchObject({
    operation: "aggregate",
    changed_fields: [],
    payload_json: { __owned: { lines: { records: [{ label: "Line one" }] } } },
  });
  await transactions.run(context.planeKey, context, async tx => {
    const first = await adapter.read(aggregateCommand, d, tx, binding);
    await sql`SELECT pg_sleep(0.01)`.execute(tx);
    const second = await adapter.read(aggregateCommand, d, tx, binding);
    expect(second).toEqual(first); // Observation metadata cannot manufacture an owned-state change.
  });
  const collectionPayload = (await sql<{ owned: unknown }>`SELECT p.payload_json->'owned'->'lines' AS owned
    FROM snapshot.entity_snapshot p JOIN snapshot.record_version v ON v.snapshot_id=p.snapshot_id
    WHERE v.operation='aggregate' ORDER BY v.occurred_at DESC LIMIT 1`.execute(db)).rows[0]!.owned;
  expect(parseCollectionCapture(collectionPayload)).toMatchObject({
    schema: "athyper.collection-capture/1", coverage: "complete", consistency: "root_transaction",
    definition: { key: "lines", identityField: "id", sourceEntity: "example_child", scope: "owned-active-lines.v1" },
    records: [{ label: "Line one" }],
  });
  expect(await aggregate.mutateAggregate(aggregateCommand)).toMatchObject({
    kind: "Committed",
    replayed: true,
  });
  expect(
    await aggregate.mutateAggregate({
      ...aggregateCommand,
      changes: {
        ...aggregateCommand.changes,
        collections: { lines: { create: [{ label: "Different" }] } },
      },
    }),
  ).toMatchObject({ kind: "IdempotencyConflict", reason: "reused" });
  const domain = createTransactionalRecordActionService<
    Transaction<Record<string, never>>
  >({
    ...options,
    handlers: new Map([
      [
        "test.rename.v1",
        {
          async execute(command, _descriptor, tx) {
            await sql`UPDATE master.example_record SET name=${String(command.input?.name)},row_version=row_version+1 WHERE tenant_id=${command.context.tenantId}::uuid AND id=${command.recordId}::uuid AND row_version=${command.expectedVersion}`.execute(
              tx,
            );
            if (command.input?.decline)
              return {
                kind: "ValidationFailed" as const,
                code: "DECLINED",
                message: "Domain rejected after validation",
              };
            return {
              kind: "Committed" as const,
              action: "domain" as const,
              entityCode: command.entityCode,
              recordId: command.recordId,
              replayed: false,
            };
          },
        },
      ],
    ]),
  });
  const domainCommand = {
    ...base,
    recordId,
    expectedVersion: 6,
    actionCode: "rename",
    input: { name: "Domain name" },
    idempotencyKey: "history-domain-000001",
  };
  await sql
    .raw(
      `CREATE TRIGGER reject_history_capture BEFORE INSERT ON snapshot.entity_snapshot_identity FOR EACH ROW EXECUTE FUNCTION snapshot.reject_history_capture();`,
    )
    .execute(db);
  const beforeDomain = await counts();
  await expect(domain.execute(domainCommand)).rejects.toThrow(
    "required capture failed",
  );
  expect(await counts()).toEqual(beforeDomain);
  await sql`DROP TRIGGER reject_history_capture ON snapshot.entity_snapshot_identity`.execute(
    db,
  );
  expect(await domain.execute(domainCommand)).toMatchObject({
    kind: "Committed",
  });
  expect((await rows()).at(-1)).toMatchObject({
    operation: "domain",
    payload_json: { name: "Domain name" },
  });
  expect(await domain.execute(domainCommand)).toMatchObject({
    kind: "Committed",
    replayed: true,
  });
  expect(
    await aggregate.mutateAggregate({
      ...aggregateCommand,
      idempotencyKey: "history-aggregate-stale-00001",
    }),
  ).toMatchObject({ kind: "VersionConflict" });
  expect(
    await domain.execute({
      ...domainCommand,
      idempotencyKey: "history-domain-stale-00001",
    }),
  ).toMatchObject({ kind: "VersionConflict" });
  const beforeDeclined = await counts();
  expect(
    await domain.execute({
      ...domainCommand,
      expectedVersion: 7,
      idempotencyKey: "history-domain-declined-00001",
      input: { name: "Must roll back", decline: true },
    }),
  ).toMatchObject({ kind: "ValidationFailed" });
  expect(await counts()).toEqual(beforeDeclined);
  expect(
    (
      await sql<any>`SELECT name,row_version FROM master.example_record WHERE id=${recordId}::uuid`.execute(
        db,
      )
    ).rows[0],
  ).toEqual({ name: "Domain name", row_version: "7" });
  const deleteCommand = {
    ...base,
    recordId,
    expectedVersion: 7,
    idempotencyKey: "history-delete-000001",
  };
  await sql
    .raw(
      `CREATE TRIGGER reject_history_capture BEFORE INSERT ON snapshot.entity_snapshot_identity FOR EACH ROW EXECUTE FUNCTION snapshot.reject_history_capture();`,
    )
    .execute(db);
  const beforeDelete = await counts();
  await expect(service.delete(deleteCommand)).rejects.toThrow(
    "required capture failed",
  );
  expect(await counts()).toEqual(beforeDelete);
  expect(
    (
      await sql`SELECT id FROM master.example_record WHERE id=${recordId}::uuid`.execute(
        db,
      )
    ).rows,
  ).toHaveLength(1);
  await sql`DROP TRIGGER reject_history_capture ON snapshot.entity_snapshot_identity`.execute(
    db,
  );
  expect(await service.delete(deleteCommand)).toMatchObject({
    kind: "Committed",
  });
  expect((await rows()).at(-1)).toMatchObject({
    operation: "delete",
    source_record_version: "8",
    payload_json: {
      name: "Domain name",
      __tombstone: true,
      __owned: { lines: { records: [{ label: "Line one" }] } },
    },
  });
  expect(
    (
      await sql`SELECT id FROM master.example_record WHERE id=${recordId}::uuid`.execute(
        db,
      )
    ).rows,
  ).toHaveLength(0);
  expect(await service.delete(deleteCommand)).toMatchObject({
    kind: "Committed",
    replayed: true,
  });

  // Soft deletion captures the same pre-delete semantics and the actual committed counter.
  await sql`ALTER TABLE master.example_record ADD COLUMN deleted_at timestamptz`.execute(
    db,
  );
  d = { ...d, storage: { ...d.storage, softDeleteField: "deleted_at" } };
  const soft = await service.create({
    ...create,
    idempotencyKey: "history-soft-create-00001",
  });
  if (soft.kind !== "Committed") throw Error("soft fixture failed");
  expect(
    await service.delete({
      ...deleteCommand,
      recordId: soft.recordId,
      expectedVersion: 1,
      idempotencyKey: "history-soft-delete-00001",
    }),
  ).toMatchObject({ kind: "Committed" });
  expect(
    (
      await sql<any>`SELECT source_record_version,payload_json FROM snapshot.record_version WHERE entity_id=${soft.recordId}::uuid ORDER BY source_record_version DESC LIMIT 1`.execute(
        db,
      )
    ).rows[0],
  ).toMatchObject({
    source_record_version: "2",
    payload_json: { name: "Original", __tombstone: true },
  });
  expect(
    (
      await sql<any>`SELECT deleted_at FROM master.example_record WHERE id=${soft.recordId}::uuid`.execute(
        db,
      )
    ).rows[0].deleted_at,
  ).toBeTruthy();
}
