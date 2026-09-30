import { sql } from "kysely";
import type {
  RoundingAggregate,
  RoundingRepository,
} from "@athyper/server-contract-control-admin";
import {
  ControlRepositoryDb,
  type ControlTx,
  type Row,
  fail,
  version,
} from "./control-repository-db.js";
const statusToDb = {
  draft: "draft",
  active: "active",
  suspended: "inactive",
  retired: "archived",
};
export class KyselyRoundingRepository
  extends ControlRepositoryDb
  implements RoundingRepository
{
  async getCurrencyDefaults(tenant: string, code: string) {
    return this.run(tenant, undefined, undefined, async (tx) => {
      const row = (
        await sql<Row>`SELECT minor_units,metadata FROM shared.currency WHERE code=${code}::char(3) AND status='active'`.execute(
          tx,
        )
      ).rows[0];
      if (!row || row.minor_units == null) return undefined;
      return {
        minorUnits: Number(row.minor_units),
        ...(typeof row.metadata?.rounding_increment === "string"
          ? { roundingIncrement: row.metadata.rounding_increment }
          : {}),
      };
    });
  }
  async list(tenant: string) {
    return this.run(tenant, undefined, undefined, async (tx) =>
      (
        await sql<Row>`SELECT * FROM control.rounding_rule WHERE tenant_id=${tenant}::uuid ORDER BY code`.execute(
          tx,
        )
      ).rows.map(map),
    );
  }
  async get(tenant: string, id: string) {
    return this.run(tenant, undefined, undefined, async (tx) => {
      const row = await read(tx, tenant, id);
      return row ? map(row) : undefined;
    });
  }
  async save(
    input: Omit<RoundingAggregate, "version"> & { expectedVersion?: number },
    actor: string,
  ) {
    if (this.plane !== "neon") throw fail(403, "FINANCE_WRITER_NEON_REQUIRED");
    return this.run(
      input.tenantId,
      actor,
      `rounding:${input.tenantId}`,
      async (tx) => {
        const old = await read(tx, input.tenantId, input.id, true);
        version(old, input.expectedVersion);
        if (old && old.status !== "draft")
          throw fail(409, "ROUNDING_ACTIVE_IMMUTABLE");
        if (old && old.code !== input.code)
          throw fail(409, "IDENTITY_IMMUTABLE");
        const contexts = JSON.stringify(input.contexts);
        let row: Row;
        if (!old)
          row = (
            await sql<Row>`INSERT INTO control.rounding_rule(id,tenant_id,code,name,method,precision_digits,rounding_increment,configured_contexts,status,created_by) VALUES(${input.id}::uuid,${input.tenantId}::uuid,${input.code},${input.name},${input.method},${input.precisionDigits ?? null},${input.roundingIncrement ?? null}::numeric,${contexts}::jsonb,${statusToDb[input.status]},${actor}::uuid) RETURNING *`.execute(
              tx,
            )
          ).rows[0]!;
        else
          row = (
            await sql<Row>`UPDATE control.rounding_rule SET name=${input.name},method=${input.method},precision_digits=${input.precisionDigits ?? null},rounding_increment=${input.roundingIncrement ?? null}::numeric,configured_contexts=${contexts}::jsonb,status=${statusToDb[input.status]},updated_by=${actor}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${input.id}::uuid RETURNING *`.execute(
              tx,
            )
          ).rows[0]!;
        await sql`DELETE FROM control.rounding_context WHERE tenant_id=${input.tenantId}::uuid AND rounding_rule_id=${input.id}::uuid`.execute(
          tx,
        );
        if (input.status === "active")
          for (const c of input.contexts)
            await sql`INSERT INTO control.rounding_context(tenant_id,rounding_rule_id,company_code_id,currency_code,slot,created_by) VALUES(${input.tenantId}::uuid,${input.id}::uuid,${c.companyCodeId ?? null}::uuid,${c.currencyCode ?? null},${c.slot ?? null},${actor}::uuid)`.execute(
              tx,
            );
        await this.evidence(
          tx,
          input.tenantId,
          actor,
          "rounding",
          input.id,
          Number(row.version),
          "saved",
        );
        return map(row);
      },
    );
  }
  async retire(
    tenant: string,
    id: string,
    expected: number | undefined,
    actor: string,
  ) {
    if (this.plane !== "neon") throw fail(403, "FINANCE_WRITER_NEON_REQUIRED");
    return this.run(tenant, actor, `rounding:${tenant}`, async (tx) => {
      const old = await read(tx, tenant, id, true);
      if (!old) throw fail(404, "NOT_FOUND");
      version(old, expected);
      if (old!.status === "archived") return map(old!);
      const row = (
        await sql<Row>`UPDATE control.rounding_rule SET status='archived',updated_by=${actor}::uuid WHERE tenant_id=${tenant}::uuid AND id=${id}::uuid RETURNING *`.execute(
          tx,
        )
      ).rows[0]!;
      await sql`DELETE FROM control.rounding_context WHERE tenant_id=${tenant}::uuid AND rounding_rule_id=${id}::uuid`.execute(
        tx,
      );
      await this.evidence(
        tx,
        tenant,
        actor,
        "rounding",
        id,
        Number(row.version),
        "retired",
      );
      return map(row);
    });
  }
}
async function read(tx: ControlTx, tenant: string, id: string, lock = false) {
  return (
    await sql<Row>`SELECT * FROM control.rounding_rule WHERE tenant_id=${tenant}::uuid AND id=${id}::uuid ${lock ? sql`FOR UPDATE` : sql``}`.execute(
      tx,
    )
  ).rows[0];
}
function map(r: Row): RoundingAggregate {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    code: r.code,
    name: r.name,
    method: r.method,
    version: Number(r.version),
    ...(r.precision_digits !== null
      ? { precisionDigits: Number(r.precision_digits) }
      : {}),
    ...(r.rounding_increment !== null
      ? {
          roundingIncrement: String(r.rounding_increment).replace(
            /(\.\d*?[1-9])0+$|\.0+$/,
            "$1",
          ),
        }
      : {}),
    contexts: r.configured_contexts,
    status: (
      {
        draft: "draft",
        active: "active",
        inactive: "suspended",
        archived: "retired",
      } as const
    )[r.status as "draft"],
  };
}
