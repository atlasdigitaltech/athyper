import { createHash } from "node:crypto";
import { sql } from "kysely";
import type {
  LookupRepository,
  LookupDomainRevision,
  LookupDesiredState,
  LookupValue,
} from "@athyper/server-contract-control-admin";
import {
  ControlRepositoryDb,
  type ControlTx,
  type Row,
  fail,
} from "./control-repository-db.js";
import { validateLookupDesiredState } from "./lookup-control.js";
export class KyselyLookupRepository
  extends ControlRepositoryDb
  implements LookupRepository
{
  async listDomains(tenant?: string) {
    return this.readSnapshot(tenant, async (tx) => {
      const rows = (
        await sql<Row>`SELECT * FROM control.lookup_domain ORDER BY code`.execute(
          tx,
        )
      ).rows;
      return Promise.all(rows.map((d) => current(tx, d, tenant)));
    });
  }
  async getDomain(code: string, version?: number, tenant?: string) {
    return this.readSnapshot(tenant, async (tx) => {
      if (version !== undefined) return historical(tx, code, version, tenant);
      const d = (
        await sql<Row>`SELECT * FROM control.lookup_domain WHERE code=${code}`.execute(
          tx,
        )
      ).rows[0];
      return d ? current(tx, d, tenant) : undefined;
    });
  }
  async isValueReferenced(domain: string, code: string, tenant?: string) {
    return this.run(tenant, undefined, undefined, async (tx) => {
      const r = (
        await sql<Row>`SELECT id FROM control.lookup_value WHERE domain_code=${domain} AND code=${code} AND tenant_id IS NOT DISTINCT FROM ${tenant ?? null}::uuid`.execute(
          tx,
        )
      ).rows[0];
      return !r || referenced(tx, r.id);
    });
  }
  async publishDesiredState(
    input: LookupDesiredState,
    actor: string,
    tenant?: string,
  ) {
    validateLookupDesiredState(input);
    if (input.targetPlane !== this.plane || !tenant)
      throw fail(403, "DESIRED_STATE_TARGET_MISMATCH");
    const hash = createHash("sha256")
      .update(JSON.stringify(canonical(input)))
      .digest("hex");
    return this.run(tenant, actor, "lookup-publication", async (tx) => {
      const receipt = (
        await sql<Row>`SELECT * FROM control.lookup_publication_receipt WHERE desired_state_id=${input.desiredStateId}`.execute(
          tx,
        )
      ).rows[0];
      if (receipt) {
        if (receipt.fingerprint !== hash)
          throw fail(409, "IDEMPOTENCY_CONFLICT");
        return (await historical(
          tx,
          receipt.domain_code,
          Number(receipt.version),
          tenant,
        ))!;
      }
      const d = input.domain;
      let old = (
        await sql<Row>`SELECT * FROM control.lookup_domain WHERE code=${d.code} FOR UPDATE`.execute(
          tx,
        )
      ).rows[0];
      if (
        old &&
        (old.id !== d.id || input.sourceRevision <= Number(old.source_revision))
      )
        throw fail(409, "VERSION_CONFLICT");
      if (old?.status === "deprecated") throw fail(409, "LIFECYCLE_INVALID");
      if (!old) {
        if (d.status !== "active")
          throw fail(400, "LOOKUP_INITIAL_STATE_INVALID");
        old = (
          await sql<Row>`INSERT INTO control.lookup_domain(id,code,name,source_schema,is_extensible,source_revision,created_by) VALUES(${d.id}::uuid,${d.code},${d.name},${d.sourceSchema},${d.extensible},${input.sourceRevision},${actor}::uuid) RETURNING *`.execute(
            tx,
          )
        ).rows[0]!;
      }
      if (d.status === "retired" || (old.is_extensible && !d.extensible)) {
        const result = (
          await sql<{
            allowed: boolean;
          }>`SELECT control.admin_lookup_domain_change_allowed(${d.code},${d.status === "active"},${d.extensible}) AS allowed`.execute(
            tx,
          )
        ).rows[0];
        if (!result?.allowed) throw fail(409, "REFERENCE_IN_USE");
      }
      const existing = (
        await sql<Row>`SELECT * FROM control.lookup_value WHERE domain_code=${d.code} AND tenant_id IS NULL FOR UPDATE`.execute(
          tx,
        )
      ).rows;
      const incoming = new Map(d.values.map((v) => [v.code, v]));
      for (const value of existing)
        if (
          (!incoming.has(value.code) ||
            incoming.get(value.code)!.status === "retired" ||
            d.status === "retired") &&
          (await referenced(tx, value.id))
        )
          throw fail(409, "REFERENCE_IN_USE");
      for (const v of d.values) {
        const prior = existing.find((x) => x.code === v.code);
        if (prior && prior.id !== v.id) throw fail(409, "IDENTITY_IMMUTABLE");
        if (!prior)
          await sql`INSERT INTO control.lookup_value(id,domain_code,tenant_id,code,name,sort_order,metadata,is_system,status,created_by) VALUES(${v.id}::uuid,${d.code},NULL,${v.code},${v.name},${v.sortOrder},${JSON.stringify(v.metadata)}::jsonb,true,${d.status === "retired" || v.status === "retired" ? "deprecated" : "active"},${actor}::uuid)`.execute(
            tx,
          );
        else
          await sql`UPDATE control.lookup_value SET name=${v.name},sort_order=${v.sortOrder},metadata=${JSON.stringify(v.metadata)}::jsonb,status=${d.status === "retired" || v.status === "retired" ? "deprecated" : "active"},updated_by=${actor}::uuid WHERE id=${v.id}::uuid AND tenant_id IS NULL`.execute(
            tx,
          );
      }
      for (const v of existing)
        if (!incoming.has(v.code))
          await sql`UPDATE control.lookup_value SET status='deprecated',updated_by=${actor}::uuid WHERE id=${v.id}::uuid AND tenant_id IS NULL`.execute(
            tx,
          );
      const updated = (
        await sql<Row>`UPDATE control.lookup_domain SET name=${d.name},source_schema=${d.sourceSchema},is_extensible=${d.extensible},source_revision=${input.sourceRevision},status=${d.status === "active" ? "active" : "deprecated"},updated_by=${actor}::uuid WHERE id=${d.id}::uuid RETURNING *`.execute(
          tx,
        )
      ).rows[0]!;
      const global = await current(tx, updated, undefined);
      await snapshot(tx, global);
      await sql`INSERT INTO control.lookup_publication_receipt(desired_state_id,fingerprint,domain_code,version) VALUES(${input.desiredStateId},${hash},${d.code},${updated.version})`.execute(
        tx,
      );
      const saved = await current(tx, updated, tenant);
      await tenantSnapshot(tx, saved, tenant);
      await this.evidence(
        tx,
        tenant,
        actor,
        "lookups",
        d.id,
        Number(updated.version),
        "published",
        { domainCode: d.code, catalogScope: "plane" },
      );
      return saved;
    });
  }
  async retireValue(
    input: {
      domainCode: string;
      valueCode: string;
      tenantId: string;
      expectedVersion: number;
    },
    actor: string,
  ) {
    return this.run(input.tenantId, actor, "lookup-publication", async (tx) => {
      const d = (
        await sql<Row>`SELECT * FROM control.lookup_domain WHERE code=${input.domainCode} FOR UPDATE`.execute(
          tx,
        )
      ).rows[0];
      if (!d) throw fail(404, "NOT_FOUND");
      if (d.version !== input.expectedVersion)
        throw fail(409, "VERSION_CONFLICT");
      if (!d.is_extensible || d.status !== "active")
        throw fail(409, "OVERRIDE_NOT_ALLOWED");
      const value = (
        await sql<Row>`SELECT * FROM control.lookup_value WHERE domain_code=${input.domainCode} AND code=${input.valueCode} AND tenant_id=${input.tenantId}::uuid FOR UPDATE`.execute(
          tx,
        )
      ).rows[0];
      if (!value) throw fail(404, "NOT_FOUND");
      if (value.status === "deprecated") return current(tx, d, input.tenantId);
      if (await referenced(tx, value.id)) throw fail(409, "REFERENCE_IN_USE");
      // Capture the pre-change tenant view too, including extensions created outside this API.
      const before = await current(tx, d, input.tenantId);
      await tenantSnapshot(tx, before, input.tenantId);
      await sql`UPDATE control.lookup_value SET status='deprecated',updated_by=${actor}::uuid WHERE id=${value.id}::uuid AND tenant_id=${input.tenantId}::uuid`.execute(
        tx,
      );
      const next = (
        await sql<Row>`UPDATE control.lookup_domain SET updated_by=${actor}::uuid WHERE code=${input.domainCode} RETURNING *`.execute(
          tx,
        )
      ).rows[0]!;
      await snapshot(tx, await current(tx, next, undefined));
      const saved = await current(tx, next, input.tenantId);
      await tenantSnapshot(tx, saved, input.tenantId);
      await this.evidence(
        tx,
        input.tenantId,
        actor,
        "lookups",
        next.id,
        Number(next.version),
        "retired",
        { valueId: value.id },
      );
      return saved;
    });
  }
}
async function current(
  tx: ControlTx,
  d: Row,
  tenant?: string,
): Promise<LookupDomainRevision> {
  const rows = (
    await sql<Row>`SELECT * FROM control.lookup_value WHERE domain_code=${d.code} AND (tenant_id IS NULL OR tenant_id=${tenant ?? null}::uuid) ORDER BY sort_order,code,id`.execute(
      tx,
    )
  ).rows;
  return {
    id: d.id,
    code: d.code,
    version: Number(d.version),
    name: d.name,
    sourceSchema: d.source_schema,
    extensible: d.is_extensible,
    status: d.status === "active" ? "active" : "retired",
    values: rows.map(value),
  };
}
function value(r: Row): LookupValue {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    ...(r.tenant_id ? { tenantId: r.tenant_id } : {}),
    sortOrder: Number(r.sort_order),
    metadata: r.metadata,
    status: r.status === "active" ? "active" : "retired",
  };
}
async function snapshot(tx: ControlTx, d: LookupDomainRevision) {
  await sql`INSERT INTO control.lookup_revision(domain_code,version,definition) VALUES(${d.code},${d.version},${JSON.stringify(d)}::jsonb)`.execute(
    tx,
  );
}
async function tenantSnapshot(
  tx: ControlTx,
  d: LookupDomainRevision,
  tenant: string,
) {
  await sql`INSERT INTO control.lookup_tenant_revision(tenant_id,domain_code,version,values_json) VALUES(${tenant}::uuid,${d.code},${d.version},${JSON.stringify(d.values.filter((v) => v.tenantId === tenant))}::jsonb) ON CONFLICT DO NOTHING`.execute(
    tx,
  );
}
async function historical(
  tx: ControlTx,
  code: string,
  version: number,
  tenant?: string,
): Promise<LookupDomainRevision | undefined> {
  const r = (
    await sql<Row>`SELECT definition FROM control.lookup_revision WHERE domain_code=${code} AND version=${version}`.execute(
      tx,
    )
  ).rows[0];
  if (!r) return undefined;
  const v = tenant
    ? ((
        await sql<Row>`SELECT values_json FROM control.lookup_tenant_revision WHERE tenant_id=${tenant}::uuid AND domain_code=${code} AND version<=${version} ORDER BY version DESC LIMIT 1`.execute(
          tx,
        )
      ).rows[0]?.values_json ?? [])
    : [];
  return { ...r.definition, version, values: [...r.definition.values, ...v] };
}
async function referenced(tx: ControlTx, id: string) {
  return Boolean(
    (
      await sql<Row>`SELECT control.admin_lookup_value_referenced(${id}::uuid) AS used`.execute(
        tx,
      )
    ).rows[0]?.used,
  );
}
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, value]) => [k, canonical(value)]),
    );
  return v;
}
