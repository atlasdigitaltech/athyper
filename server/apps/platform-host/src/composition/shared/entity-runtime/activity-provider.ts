import { technicalFieldKeys } from "@athyper/server-contract-metadata";
import { queryActivityTimeline } from "./activity-timeline.js";
import { equivalentSnapshotRecordContract } from "./activity-snapshot-compatibility.js";
import {
  assertCollectionProvider,
  type ActivityCollectionProviderRegistration,
} from "./activity-collections.js";
import { sql, type Transaction } from "kysely";
import type { Authorizer } from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type {
  RecordSnapshot,
  RecordTransactionCoordinator,
} from "@athyper/server-contract-records";
import {
  ActivitySnapshotRepository,
  readableRecordFields,
  RecordServiceError,
  compareCapturedCollection,
  parseCollectionCapture,
  canonicalJson,
} from "@athyper/server-service-records";
import {
  readCompiledRuntimeContract,
  type PinnedCompiledEntityReader,
} from "@athyper/server-platform-metadata";
import {
  EntityActivityError,
  type EntityActivityProvider,
  type ActivitySubject,
  type ActivityAdmission,
} from "@athyper/server-platform-experience";
import type {
  ActivitySnapshot,
  ActivityVersionItem,
  ActivitySnapshotItem,
} from "@athyper/contract-platform-entity-runtime";

type Tx = Transaction<Record<string, never>>;
export function createEntityActivityProvider(options: {
  reader: PinnedCompiledEntityReader;
  admitDescriptor(descriptor: EntityRuntimeDescriptor): Promise<EntityRuntimeDescriptor>;
  collectionProviders?: ReadonlyMap<
    string,
    ActivityCollectionProviderRegistration
  >;
  authorizer: Authorizer;
  transactions: RecordTransactionCoordinator<Tx>;
  read(
    input: ActivitySubject,
    descriptor: EntityRuntimeDescriptor,
    fields: readonly string[],
    admission: ActivityAdmission,
  ): Promise<Readonly<Record<string, unknown>> | null>;
}): EntityActivityProvider {
  const snapshots = new ActivitySnapshotRepository(options.transactions);
  async function source(input: ActivitySubject, admission: ActivityAdmission) {
    const descriptor = await options.admitDescriptor(await readCompiledRuntimeContract(
      options.reader,
      admission.release,
    ));
    if (
      descriptor.entityCode !== input.entityCode ||
      descriptor.planeKey !== input.context.planeKey
    )
      throw new EntityActivityError(403, "ACTIVITY_SOURCE_DENIED");
    const fields = await readableRecordFields(
      options.authorizer,
      input.context,
      descriptor,
    );
    return {
      descriptor,
      fields,
      scope: {
        tenantId: input.context.tenantId,
        principalId: input.context.principalId,
        planeKey: input.context.planeKey,
        entityType: `${descriptor.storage.schema}.${descriptor.storage.object}`,
        entityCode: input.entityCode,
        entityId: input.recordId,
      },
    };
  }
  async function load(
    input: ActivitySubject,
    admission: ActivityAdmission,
    id: string,
  ) {
    const current = await source(input, admission);
    const snapshot = await snapshots.get(current.scope, id);
    if (!snapshot)
      throw new EntityActivityError(404, "ACTIVITY_SNAPSHOT_NOT_FOUND");
    if (
      ![1, 2, 3].includes(snapshot.payloadSchemaVersion)
    )
      throw new EntityActivityError(409, "ACTIVITY_SNAPSHOT_CONTRACT_MISMATCH");
    if (snapshot.entityContractHash !== current.descriptor.contractHash) {
      const active = await options.reader.artifactByKey(
        admission.release, `${input.entityCode}/runtime`, "runtime_contract",
      );
      const historical = await options.transactions.run(
        input.context.planeKey, input.context,
        async (tx) => (await sql<{ artifact: unknown }>`
          SELECT member AS artifact
          FROM runtime_meta.applied_release_payload p
          JOIN runtime_meta.applied_release r ON r.id=p.applied_release_id
          CROSS JOIN LATERAL jsonb_array_elements(p.payload_json->'artifacts') member
          WHERE (p.tenant_id IS NULL OR p.tenant_id=${input.context.tenantId}::uuid)
            AND r.activated_at IS NOT NULL
            AND r.verification_evidence->>'signature_verified'='true'
            AND member->>'artifactType'='runtime_contract'
            AND member->>'artifactKey'=${`${input.entityCode}/runtime`}
            AND member->>'entityCode'=${input.entityCode}
            AND member->>'plane'=${input.context.planeKey}
            AND member->>'artifactHash'=${`sha256:${snapshot.entityContractHash}`}
          LIMIT 1`.execute(tx)).rows[0]?.artifact,
      );
      if (!equivalentSnapshotRecordContract(historical, active))
        throw new EntityActivityError(409, "ACTIVITY_SNAPSHOT_CONTRACT_MISMATCH");
    }
    const envelope = snapshot.payload;
    let payload = envelope;
    if (snapshot.payloadSchemaVersion >= 2) {
      if (
        envelope.schema !== "athyper.activity-snapshot/1" ||
        !envelope.record ||
        typeof envelope.record !== "object" ||
        Array.isArray(envelope.record) ||
        !envelope.coverage ||
        typeof envelope.coverage !== "object"
      )
        throw new EntityActivityError(
          409,
          "ACTIVITY_SNAPSHOT_FORMAT_UNAVAILABLE",
        );
      payload = envelope.record as Readonly<Record<string, unknown>>;
      const coverage = envelope.coverage as Record<string, unknown>;
      if (
        ![
          "authorized_fields",
          ...(snapshot.payloadSchemaVersion === 3 ? ["declared_fields"] : []),
        ].includes(String(coverage.kind)) ||
        !Array.isArray(coverage.fields) ||
        coverage.fields.some((key) => typeof key !== "string") ||
        JSON.stringify([...coverage.fields].sort()) !==
          JSON.stringify(Object.keys(payload).sort())
      )
        throw new EntityActivityError(
          409,
          "ACTIVITY_SNAPSHOT_FORMAT_UNAVAILABLE",
        );
    }
    // Technical identities are never shown in a snapshot or compared
    // (Compare blueprint 9.6, `technicalFieldKeys`); a captured reference is
    // marked so it is shown as a linked record, never as an identifier.
    const technical = technicalFieldKeys(current.descriptor);
    const view: ActivitySnapshot = {
      ...header(snapshot),
      fields: current.fields.filter((field) => !technical.has(field.key)).map((field) => ({
        key: field.key,
        label: field.key,
        ...(Object.hasOwn(payload, field.key)
          ? { state: "value" as const, value: payload[field.key] }
          : { state: "uncaptured" as const }),
        ...(field.type === "reference" ? { reference: true as const } : {}),
      })),
    };
    return { snapshot, view, descriptor: current.descriptor, fields: current.fields };
  }
  async function collectionAccess(
    input: ActivitySubject,
    admission: ActivityAdmission,
    key: string,
  ) {
    const binding = admission.binding.collections?.find(
      (item) => item.definition.key === key,
    );
    if (!binding)
      throw new EntityActivityError(404, "ACTIVITY_COLLECTION_UNAVAILABLE");
    const registration = options.collectionProviders?.get(
      admission.binding.recording?.adapterKey ?? "",
    );
    try {
      assertCollectionProvider(registration);
    } catch {
      throw new EntityActivityError(
        503,
        "ACTIVITY_COLLECTION_PROVIDER_UNAVAILABLE",
      );
    }
    const { descriptor } = await source(input, admission);
    if (
      binding.manualCapture?.consistency!=="independent" && !descriptor.aggregate?.collections.some(
        (item) =>
          item.code === key &&
          item.entityCode === binding.definition.sourceEntity,
      )
    )
      throw new EntityActivityError(
        503,
        "ACTIVITY_COLLECTION_PROVIDER_UNAVAILABLE",
      );
    await registration.qualifyRuntime({
      subject: input,
      admission,
      descriptor,
      binding,
    });
    const authorization = await registration.authorize({
      subject: input,
      admission,
      descriptor,
      binding,
    });
    if (!authorization.discoverable)
      throw new EntityActivityError(404, "ACTIVITY_COLLECTION_UNAVAILABLE");
    return { binding, authorization };
  }
  async function collectionProjection(
    input: ActivitySubject,
    admission: ActivityAdmission,
    from: string,
    to: string,
    key: string,
  ) {
    const { binding, authorization } = await collectionAccess(
      input,
      admission,
      key,
    );
    let [a, b] = await Promise.all([
      load(input, admission, from),
      load(input, admission, to),
    ]);
    if (a.snapshot.versionNumber > b.snapshot.versionNumber) {
      [a, b] = [b, a];
      [from, to] = [to, from];
    }
    const owned = (snapshot: RecordSnapshot) => {
      const collections = snapshot.payload.owned;
      if (
        snapshot.payloadSchemaVersion !== 3 ||
        !collections ||
        typeof collections !== "object" ||
        Array.isArray(collections) ||
        !Object.hasOwn(collections, key)
      )
        throw new EntityActivityError(
          409,
          "ACTIVITY_COLLECTION_CAPTURE_UNAVAILABLE",
        );
      return (collections as Record<string, unknown>)[key];
    };
    try {
      const result = await compareCapturedCollection({
        subject: {
          tenantId: input.context.tenantId,
          plane: input.context.planeKey,
          entityCode: input.entityCode,
          recordId: input.recordId,
        },
        definition: binding.definition,
        before: owned(a.snapshot),
        after: owned(b.snapshot),
        authorization,
        maximumRecords: binding.maximumRecords,
      });
      if (!result)
        throw new EntityActivityError(404, "ACTIVITY_COLLECTION_UNAVAILABLE");
      return {
        result: {
          ...result,
          beforeCapturedAt: result.beforeCapturedAt ?? a.snapshot.capturedAt,
          afterCapturedAt: result.afterCapturedAt ?? b.snapshot.capturedAt,
        },
        from,
        to,
        capturedAt: a.snapshot.capturedAt,
      };
    } catch (error) {
      if (error instanceof EntityActivityError) throw error;
      // Do not serialize raw manifests, authorization diagnostics or stored values.
      throw new EntityActivityError(
        409,
        "ACTIVITY_COLLECTION_COMPARISON_UNAVAILABLE",
      );
    }
  }
  return {
    async timeline(input,admission,page) {
      const current=await source(input,admission);
      return options.transactions.run(input.context.planeKey,input.context,tx=>queryActivityTimeline(tx,input,admission,page,current.scope.entityType,new Set(current.fields.map(field=>field.key))));
    },
    async collection(input, admission, id, key) {
      const { result, capturedAt } = await collectionProjection(
        input,
        admission,
        id,
        id,
        key,
      );
      return {
        key: result.key,
        label: result.label,
        snapshotId: id,
        capturedAt: result.afterCapturedAt ?? capturedAt,
        notes: result.notes,
        items: result.items.map((item) => ({
          id: item.id,
          ...(item.label ? {label:item.label} : {}),
          fields: item.fields.map((field) => ({
            key: field.key,
            label: field.label,
            ...(field.format ? {format:field.format} : {}),
            ...field.after,
          })),
        })),
      };
    },
    async compareCollection(input, admission, from, to, key) {
      const projection = await collectionProjection(
        input,
        admission,
        from,
        to,
        key,
      );
      return { ...projection.result, from: projection.from, to: projection.to };
    },
    async versions(input, admission, page) {
      const current = await source(input, admission);
      if (!("recording" in admission.binding) || !admission.binding.recording)
        throw new EntityActivityError(503, "ACTIVITY_VERSIONS_UNAVAILABLE");
      const visible = new Set(current.fields.map((f) => f.key));
      return options.transactions.run(
        input.context.planeKey,
        input.context,
        async (tx) =>
          (
            await sql<ActivityVersionItem>`SELECT id::text,to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "occurredAt",
          source_record_version::float8 AS version,operation,actor_principal_id::text AS actor,changed_fields AS "changedFields"
          FROM snapshot.record_version WHERE tenant_id=${input.context.tenantId}::uuid AND plane_code=${input.context.planeKey}
          AND entity_type=${current.scope.entityType} AND entity_code=${input.entityCode} AND entity_id=${input.recordId}::uuid
          AND occurred_at>=${page.from}::timestamptz AND occurred_at<=${page.until}::timestamptz
          ${page.after ? sql`AND (occurred_at,id)<(${page.after.at}::timestamptz,${page.after.id}::uuid)` : sql``}
          ORDER BY occurred_at DESC,id DESC LIMIT ${page.limit}`.execute(tx)
          ).rows.map((row) => {
            if (!Number.isSafeInteger(row.version) || row.version < 1)
              throw new EntityActivityError(409, "ACTIVITY_VERSION_INVALID");
            return {
              id: row.id,
              occurredAt: row.occurredAt,
              version: row.version,
              operation: row.operation,
              actor: row.actor,
              changedFields: row.changedFields.filter((key) =>
                visible.has(key),
              ),
            };
          }),
      );
    },
    async audit(input, admission, page) {
      const current = await source(input, admission);
      const visible = new Set(current.fields.map((f) => f.key));
      return options.transactions.run(
        input.context.planeKey,
        input.context,
        async (tx) =>
          (
            await sql<{
              id: string;
              occurredAt: string;
              event: string;
              operation: string;
              outcome: string;
              actor: string | null;
              changedFields: string[] | null;
            }>`
        SELECT id::text,to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "occurredAt",event_code AS event,operation,outcome,actor_principal_id::text AS actor,changed_fields AS "changedFields"
        FROM audit.audit_log WHERE tenant_id=${input.context.tenantId}::uuid AND plane_code=${input.context.planeKey}
          AND entity_type=${input.entityCode} AND entity_id=${input.recordId}::uuid
          ${page.filters?.event?sql`AND event_code=${page.filters.event}`:sql``}
          ${page.filters?.actor?sql`AND actor_principal_id=${page.filters.actor}::uuid`:sql``}
          ${page.filters?.outcome?sql`AND outcome=${page.filters.outcome}`:sql``}
          AND occurred_at>=${page.from}::timestamptz AND occurred_at<=${page.until}::timestamptz
          ${page.after ? sql`AND (occurred_at,id)<(${page.after.at}::timestamptz,${page.after.id}::uuid)` : sql``}
        ORDER BY occurred_at DESC,id DESC LIMIT ${page.limit}`.execute(tx)
          ).rows.map((row) => ({
            ...row,
            changedFields: (row.changedFields ?? []).filter((key) =>
              visible.has(key),
            ),
          })),
      );
    },
    async snapshots(input, admission, page) {
      const { scope } = await source(input, admission);
      return (await snapshots.list(scope, page)).map((row) => ({
        id: String(row.id),
        capturedAt: String(row.captured_at),
        capturedBy: String(row.captured_by),
        sequence: Number(row.version_number),
        sourceRecordVersion:
          row.source_record_version == null
            ? null
            : Number(row.source_record_version),
        coverage:
          row.payload_schema_version === 3 && row.capture_kind !== "manual"
            ? "declared_fields"
            : [2, 3].includes(Number(row.payload_schema_version))
              ? "authorized_fields"
              : "unknown",
      }));
    },
    async snapshot(input, admission, id) {
      const { view } = await load(input, admission, id);
      if (!admission.binding.collections?.length) return view;
      const collections: { key: string; label: string; sectionKey: string }[] = [];
      for (const declared of admission.binding.collections) {
        try {
          const { authorization } = await collectionAccess(
            input,
            admission,
            declared.definition.key,
          );
          collections.push({
            key: declared.definition.key,
            label: authorization.label,
            sectionKey: declared.sectionKey,
          });
        } catch (error) {
          if (!(error instanceof EntityActivityError && error.status === 404))
            throw error;
        }
      }
      return { ...view, collections };
    },
    async compare(input, admission, from, to) {
      let [a, b] = await Promise.all([
        load(input, admission, from),
        load(input, admission, to),
      ]);
      if (
        (a.snapshot.payloadSchemaVersion !== b.snapshot.payloadSchemaVersion &&
          !(
            a.snapshot.payloadSchemaVersion >= 2 &&
            b.snapshot.payloadSchemaVersion >= 2
          ))
      )
        throw new EntityActivityError(
          409,
          "ACTIVITY_SNAPSHOT_CONTRACT_MISMATCH",
        );
      // Snapshot sequence is authoritative within this record. Selection order and
      // browser pagination must not reverse the earlier/later comparison.
      if (a.snapshot.versionNumber > b.snapshot.versionNumber) {
        [a, b] = [b, a];
        [from, to] = [to, from];
      }
      // Intersect current visibility from both reads; a revoked field is never returned from either side.
      // Technical identities were already left out by `load`.
      return {
        from,
        to,
        fields: a.view.fields.flatMap((left) => {
          const right = b.view.fields.find((f) => f.key === left.key);
          return right
            ? [
                {
                  key: left.key,
                  label: left.label,
                  before: {
                    state: left.state,
                    ...(left.state === "value" ? { value: left.value } : {}),
                  },
                  after: {
                    state: right.state,
                    ...(right.state === "value" ? { value: right.value } : {}),
                  },
                  changed:
                    left.state === "value" &&
                    right.state === "value" &&
                    stable(left.value) !== stable(right.value),
                  ...(left.reference ? { reference: true as const } : {}),
                },
              ]
            : [];
        }),
      };
    },
    async capture(input, admission, key) {
      const { scope, descriptor, fields } = await source(input, admission);
      if (admission.binding.collections?.length) {
        const registration = options.collectionProviders?.get(
          admission.binding.recording?.adapterKey ?? "",
        );
        if (
          !admission.binding.snapshots.manualCapture ||
          !registration?.captureConsistent
        )
          throw new EntityActivityError(
            503,
            "ACTIVITY_CONSISTENT_CAPTURE_UNAVAILABLE",
          );
        const declarations = admission.binding.collections;
        const accesses = await Promise.all(
          declarations.map((binding) =>
            collectionAccess(input, admission, binding.definition.key),
          ),
        );
        try {
          return await snapshots.capture({
            ...scope,
            idempotencyKey: key,
            releaseHash: admission.releaseHash,
            contractHash: descriptor.contractHash,
            retentionClass: admission.binding.snapshots.retentionClass,
            payload: {},
            readConsistent: async (transaction) => {
              const captured = await registration.captureConsistent!({
                subject: input,
                admission,
                descriptor,
                rootFields: fields.map((f) => f.key),
                transaction,
              });
              const allowedRoot = new Set(fields.map((f) => f.key));
              if (
                Object.keys(captured.record).some(
                  (key) => !allowedRoot.has(key),
                ) ||
                Object.keys(captured.owned).some(key=>!declarations.some(item=>item.definition.key===key))
              )
                throw Error("ACTIVITY_CAPTURE_PROJECTION_INVALID");
              const owned: Record<string,unknown>={...captured.owned};
              const signature = (
                definition: (typeof declarations)[number]["definition"],
              ) =>
                canonicalJson({
                  ...definition,
                  fields: [...definition.fields].sort((a, b) =>
                    a.key.localeCompare(b.key),
                  ),
                });
              for (const { binding, authorization } of accesses) {
                const independent=binding.manualCapture?.consistency==="independent";
                const optional=binding.manualCapture?.coverage==="optional";
                if(independent) {
                  if(!registration.captureIndependent)throw Error("ACTIVITY_INDEPENDENT_CAPTURE_UNAVAILABLE");
                  try {owned[binding.definition.key]=await registration.captureIndependent({subject:input,admission,binding});}
                  catch(error){if(!optional)throw error;owned[binding.definition.key]=undefined;}
                }
                if(owned[binding.definition.key]===undefined && optional)owned[binding.definition.key]={schema:"athyper.collection-capture/1",subject:{tenantId:input.context.tenantId,plane:input.context.planeKey,entityCode:input.entityCode,recordId:input.recordId},definition:binding.definition,coverage:"not_captured",consistency:"root_transaction",records:[]};
                const envelope = parseCollectionCapture(
                  owned[binding.definition.key],
                  binding.maximumRecords,
                );
                if (
                  (!optional && envelope.coverage !== "complete") ||
                  (envelope.coverage!=="not_captured" && (independent ? envelope.consistency!=="independent" : envelope.consistency!=="root_transaction" || envelope.capturedAt!==undefined)) ||
                  signature(envelope.definition) !==
                    signature(binding.definition) ||
                  canonicalJson(envelope.subject) !==
                    canonicalJson({
                      tenantId: input.context.tenantId,
                      plane: input.context.planeKey,
                      entityCode: input.entityCode,
                      recordId: input.recordId,
                    }) ||
                  authorization.membership !== "complete"
                )
                  throw Error("ACTIVITY_CAPTURE_SCOPE_INVALID");
                const visible = new Set(authorization.fields.map((f) => f.key));
                for (const record of envelope.records) {
                  const decision = await authorization.authorizeRecord({
                    id: String(record[binding.definition.identityField]),
                    after: record,
                  });
                  if (
                    !decision.readable ||
                    (binding.definition.targetField &&
                      !decision.targetReadable) ||
                    Object.keys(record).some(
                      (key) =>
                        key !== binding.definition.identityField &&
                        (!visible.has(key) || !decision.fields.includes(key)),
                    )
                  )
                    throw Error("ACTIVITY_CAPTURE_ACCESS_DENIED");
                }
              }
              return {...captured,owned};
            },
          });
        } catch (error) {
          if (error instanceof RecordServiceError)
            throw new EntityActivityError(error.statusCode, error.code);
          if (error instanceof EntityActivityError) throw error;
          throw new EntityActivityError(
            409,
            "ACTIVITY_CONSISTENT_CAPTURE_FAILED",
          );
        }
      }
      const record = await options.read(
        input,
        descriptor,
        fields.map((f) => f.key),
        admission,
      );
      if (!record)
        throw new EntityActivityError(404, "ACTIVITY_RECORD_NOT_FOUND");
      const visible = new Set(fields.map((f) => f.key));
      const payload = Object.fromEntries(
        Object.entries(record).filter(([key]) => visible.has(key)),
      );
      const version = descriptor.storage.versionField
        ? payload[descriptor.storage.versionField]
        : undefined;
      try {
        return await snapshots.capture({
          ...scope,
          idempotencyKey: key,
          releaseHash: admission.releaseHash,
          contractHash: descriptor.contractHash,
          retentionClass: admission.binding.snapshots.retentionClass,
          ...(typeof version === "number" &&
          Number.isSafeInteger(version) &&
          version > 0
            ? { sourceRecordVersion: version }
            : {}),
          payload,
        });
      } catch (error) {
        if (error instanceof RecordServiceError)
          throw new EntityActivityError(error.statusCode, error.code);
        throw error;
      }
    },
  };
}
function header(snapshot: RecordSnapshot): ActivitySnapshotItem {
  return {
    id: snapshot.id,
    capturedAt: snapshot.capturedAt,
    capturedBy: snapshot.capturedBy,
    sequence: snapshot.versionNumber,
    sourceRecordVersion: snapshot.sourceRecordVersion ?? null,
    coverage:
      snapshot.payloadSchemaVersion === 3 &&
      (snapshot.payload.coverage as { kind?: string })?.kind ===
        "declared_fields"
        ? "declared_fields"
        : [2, 3].includes(snapshot.payloadSchemaVersion)
          ? "authorized_fields"
          : "unknown",
  };
}
function stable(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return JSON.stringify(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, stable(value)]),
  );
}
