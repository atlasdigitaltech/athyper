/**
 * Persistence — CRUD for collab.call_session.
 */

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "collab.call_session" as keyof DB & string;

// ── Types ────────────────────────────────────────────────────────────

export interface CallSession {
  id: string;
  tenantId: string;
  sessionRef: string;
  provider: string;
  direction: "inbound" | "outbound";
  status: string;
  fromNumber: string;
  toNumber: string;
  durationSeconds: number | null;
  callbackUrl: string | null;
  crmEntityType: string | null;
  crmEntityId: string | null;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date | null;
  updatedBy: string | null;
  endedAt: Date | null;
}

export interface CreateCallSessionInput {
  tenantId: string;
  sessionRef: string;
  provider?: string;
  direction: "inbound" | "outbound";
  fromNumber: string;
  toNumber: string;
  callbackUrl?: string;
  createdBy: string;
}

// ── Repository ───────────────────────────────────────────────────────

export class CallSessionRepo {
  constructor(private readonly db: Kysely<DB>) {}

  async getById(
    tenantId: string,
    id: string,
  ): Promise<CallSession | undefined> {
    const row = await (this.db as any)
      .selectFrom(TABLE)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? this.mapRow(row) : undefined;
  }

  async getByRef(
    tenantId: string,
    sessionRef: string,
  ): Promise<CallSession | undefined> {
    const row = await (this.db as any)
      .selectFrom(TABLE)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("session_ref", "=", sessionRef)
      .executeTakeFirst();
    return row ? this.mapRow(row) : undefined;
  }

  async list(
    tenantId: string,
    opts?: {
      status?: string;
      direction?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<CallSession[]> {
    let q = (this.db as any)
      .selectFrom(TABLE)
      .selectAll()
      .where("tenant_id", "=", tenantId);

    if (opts?.status) q = q.where("status", "=", opts.status);
    if (opts?.direction) q = q.where("direction", "=", opts.direction);
    q = q.orderBy("created_at", "desc");
    if (opts?.limit) q = q.limit(opts.limit);
    if (opts?.offset) q = q.offset(opts.offset);

    const rows = await q.execute();
    return rows.map((r: any) => this.mapRow(r));
  }

  async create(input: CreateCallSessionInput): Promise<CallSession> {
    const row = await (this.db as any)
      .insertInto(TABLE)
      .values({
        tenant_id: input.tenantId,
        session_ref: input.sessionRef,
        provider: input.provider ?? "twilio",
        direction: input.direction,
        from_number: input.fromNumber,
        to_number: input.toNumber,
        callback_url: input.callbackUrl ?? null,
        created_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRow(row);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: string,
    extras?: { durationSeconds?: number; updatedBy?: string; endedAt?: Date },
  ): Promise<void> {
    const values: Record<string, unknown> = {
      status,
      updated_at: new Date(),
    };
    if (extras?.durationSeconds !== undefined)
      values.duration_seconds = extras.durationSeconds;
    if (extras?.updatedBy) values.updated_by = extras.updatedBy;
    if (extras?.endedAt) values.ended_at = extras.endedAt;

    await (this.db as any)
      .updateTable(TABLE)
      .set(values)
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .execute();
  }

  async updateCrmLink(
    tenantId: string,
    id: string,
    entityType: string,
    entityId: string,
    updatedBy: string,
  ): Promise<void> {
    await (this.db as any)
      .updateTable(TABLE)
      .set({
        crm_entity_type: entityType,
        crm_entity_id: entityId,
        updated_by: updatedBy,
        updated_at: new Date(),
      })
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .execute();
  }

  async listByCrmEntity(
    tenantId: string,
    entityType: string,
    entityId: string,
  ): Promise<CallSession[]> {
    const rows = await (this.db as any)
      .selectFrom(TABLE)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("crm_entity_type", "=", entityType)
      .where("crm_entity_id", "=", entityId)
      .orderBy("created_at", "desc")
      .execute();
    return rows.map((r: any) => this.mapRow(r));
  }

  async countByDateRange(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    const result = await (this.db as any)
      .selectFrom(TABLE)
      .select((eb: any) => eb.fn.count("id").as("count"))
      .where("tenant_id", "=", tenantId)
      .where("created_at", ">=", from)
      .where("created_at", "<", to)
      .executeTakeFirst();
    return Number(result?.count ?? 0);
  }

  private mapRow(row: any): CallSession {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      sessionRef: row.session_ref,
      provider: row.provider,
      direction: row.direction,
      status: row.status,
      fromNumber: row.from_number,
      toNumber: row.to_number,
      durationSeconds: row.duration_seconds ?? null,
      callbackUrl: row.callback_url ?? null,
      crmEntityType: row.crm_entity_type ?? null,
      crmEntityId: row.crm_entity_id ?? null,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
      updatedAt: row.updated_at ? new Date(row.updated_at) : null,
      updatedBy: row.updated_by ?? null,
      endedAt: row.ended_at ? new Date(row.ended_at) : null,
    };
  }
}
