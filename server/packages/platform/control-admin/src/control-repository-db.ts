import { sql, type Kysely, type Transaction } from "kysely";
import type { PlaneKey } from "@athyper/server-foundation/context";
import { HttpError } from "@athyper/server-runtime-http";
export type ControlDb = Record<string, never>;
export type ControlTx = Transaction<ControlDb>;
export type Row = Record<string, any>;
export const fail = (status: number, code: string) =>
  new HttpError(status, `CONTROL_ADMIN_${code}`, code);
export class ControlRepositoryDb {
  constructor(
    readonly db: Kysely<ControlDb>,
    readonly plane: PlaneKey,
  ) {}
  async run<T>(
    tenant: string | undefined,
    actor: string | undefined,
    lock: string | undefined,
    work: (tx: ControlTx) => Promise<T>,
    snapshotRead = false,
  ): Promise<T> {
    try {
      return await this.db
        .transaction()
        .setIsolationLevel(snapshotRead ? "repeatable read" : "read committed")
        .execute(async (tx) => {
          if (snapshotRead) await sql`SET TRANSACTION READ ONLY`.execute(tx);
          if (
            (
              await sql<Row>`SELECT current_setting('app.database_plane',true) AS plane`.execute(
                tx,
              )
            ).rows[0]?.plane !== this.plane
          )
            throw fail(503, "REPOSITORY_PLANE_MISMATCH");
          await sql`SELECT set_config('app.current_tenant_id',${tenant ?? ""},true),set_config('app.current_principal_id',${actor ?? ""},true),set_config('app.current_actor_type','user',true),set_config('lock_timeout','5s',true)`.execute(
            tx,
          );
          if (lock)
            await sql`SELECT pg_advisory_xact_lock(hashtextextended(${lock},0))`.execute(
              tx,
            );
          return work(tx);
        });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (
        code &&
        [
          "40001",
          "40P01",
          "55P03",
          "23P01",
          "23505",
          "23503",
          "23001",
        ].includes(code)
      )
        throw fail(409, "PERSISTENCE_CONFLICT");
      if (code && ["23514", "23502", "22P02", "22003", "22007"].includes(code))
        throw fail(400, "INVALID_VALUE");
      throw error;
    }
  }
  /** Read every component from one snapshot; writers retain fresh reads after locks. */
  protected readSnapshot<T>(
    tenant: string | undefined,
    work: (tx: ControlTx) => Promise<T>,
  ): Promise<T> {
    return this.run(tenant, undefined, undefined, work, true);
  }
  async evidence(
    tx: ControlTx,
    tenant: string,
    actor: string,
    namespace: string,
    id: string,
    version: number,
    action: string,
    detail: Row = {},
  ) {
    const event = `control.${namespace}.${action}`;
    const payload = {
      schemaVersion: 1,
      plane: this.plane,
      tenantId: tenant,
      actorId: actor,
      id,
      version,
      action,
      ...detail,
      cacheInvalidation: { namespace, tenantId: tenant },
    };
    const audit = (
      await sql<Row>`SELECT audit.append_event(p_event_code=>${event},p_operation=>'update'::audit.operation_d,p_entity_type=>${`control.${namespace}`},p_entity_id=>${id}::uuid,p_context=>${JSON.stringify(payload)}::jsonb) AS id`.execute(
        tx,
      )
    ).rows[0]!;
    await sql`INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,actor_id,source,partition_key,payload,created_by) VALUES(${tenant}::uuid,${`control.${namespace}`},${event},${`${id}:${version}:${action}:${detail.jobId ?? ""}`},${`control.${namespace}`},${id}::uuid,${`control.${namespace}`},${id}::uuid,${actor}::uuid,'control-admin',${tenant},${JSON.stringify({ ...payload, auditEventId: audit.id })}::jsonb,${actor}::uuid)`.execute(
      tx,
    );
  }
}
export function version(
  current: Row | undefined,
  expected: number | undefined,
) {
  if (!Number.isSafeInteger(expected) || expected! < 0)
    throw fail(400, "INVALID_EXPECTED_VERSION");
  if (!current && expected !== 0) throw fail(404, "NOT_FOUND");
  if (current && Number(current.version) !== expected)
    throw fail(409, "VERSION_CONFLICT");
}
