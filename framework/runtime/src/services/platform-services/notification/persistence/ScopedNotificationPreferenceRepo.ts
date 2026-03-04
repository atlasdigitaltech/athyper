/**
 * ScopedNotificationPreferenceRepo — Kysely repo for notify.preference
 *
 * Supports the scoped preference hierarchy: user > org_unit > tenant.
 * Scope columns: user_principal_id (user), org_unit_id (org_unit), tenant_id only (tenant).
 */

import type {
  ChannelCode,
  PreferenceFrequency,
  PreferenceScope,
  QuietHours,
} from "../domain/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "notify.preference" as keyof DB & string;

export interface ScopedPreferenceRow {
  id: string;
  tenantId: string;
  scope: PreferenceScope;
  scopeId: string;
  eventCode: string;
  channel: ChannelCode;
  isEnabled: boolean;
  frequency: PreferenceFrequency;
  quietHours: QuietHours | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  createdByPrincipalId: string | null;
  createdByService: string | null;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export interface UpsertScopedPreferenceInput {
  tenantId: string;
  scope: PreferenceScope;
  scopeId: string;
  eventCode: string;
  channel: ChannelCode;
  isEnabled: boolean;
  frequency?: PreferenceFrequency;
  quietHours?: QuietHours;
  metadata?: Record<string, unknown>;
  createdByPrincipalId?: string;
  createdByService?: string;
}

export class ScopedNotificationPreferenceRepo {
  constructor(private readonly db: Kysely<DB>) {}

  async getByScope(
    tenantId: string,
    scope: PreferenceScope,
    scopeId: string,
    eventCode: string,
    channel: ChannelCode,
  ): Promise<ScopedPreferenceRow | undefined> {
    let query = this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("scope", "=", scope)
      .where("event_code", "=", eventCode)
      .where("channel", "=", channel);

    query = this.addScopeFilter(query, scope, scopeId);

    const row = await query.executeTakeFirst();
    return row ? this.mapRow(row) : undefined;
  }

  async getAllForScope(
    tenantId: string,
    scope: PreferenceScope,
    scopeId: string,
  ): Promise<ScopedPreferenceRow[]> {
    let query = this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("scope", "=", scope);

    query = this.addScopeFilter(query, scope, scopeId);

    const rows = await query.execute();
    return rows.map((r: any) => this.mapRow(r));
  }

  async upsert(input: UpsertScopedPreferenceInput): Promise<void> {
    const now = new Date();
    const scopeColumns = this.buildScopeColumns(input.scope, input.scopeId);

    await this.db
      .insertInto(TABLE as any)
      .values({
        id: crypto.randomUUID(),
        tenant_id: input.tenantId,
        scope: input.scope,
        ...scopeColumns,
        event_code: input.eventCode,
        channel: input.channel,
        is_enabled: input.isEnabled,
        frequency: input.frequency ?? "immediate",
        quiet_hours: input.quietHours ? JSON.stringify(input.quietHours) : null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        created_at: now,
        created_by_principal_id: input.createdByPrincipalId ?? null,
        created_by_service: input.createdByService ?? null,
      })
      .onConflict((oc: any) =>
        // The unique indexes are partial (per-scope), so we use a broad conflict target
        // and rely on the partial unique indexes to prevent duplicates per scope
        oc.columns(["id"]).doUpdateSet({
          is_enabled: input.isEnabled,
          frequency: input.frequency ?? "immediate",
          quiet_hours: input.quietHours
            ? JSON.stringify(input.quietHours)
            : null,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
          updated_at: now,
          updated_by:
            input.createdByPrincipalId ?? input.createdByService ?? null,
        }),
      )
      .execute();
  }

  async deleteByScope(
    tenantId: string,
    scope: PreferenceScope,
    scopeId: string,
    eventCode?: string,
    channel?: ChannelCode,
  ): Promise<void> {
    let query = this.db
      .deleteFrom(TABLE as any)
      .where("tenant_id", "=", tenantId)
      .where("scope", "=", scope);

    query = this.addScopeFilter(query, scope, scopeId);

    if (eventCode) {
      query = query.where("event_code", "=", eventCode);
    }
    if (channel) {
      query = query.where("channel", "=", channel);
    }

    await query.execute();
  }

  /**
   * Add scope-specific WHERE filter based on scope type.
   */
  private addScopeFilter(
    query: any,
    scope: PreferenceScope,
    scopeId: string,
  ): any {
    switch (scope) {
      case "user":
        return query.where("user_principal_id", "=", scopeId);
      case "org_unit":
        return query.where("org_unit_id", "=", scopeId);
      case "tenant":
        // For tenant scope, tenant_id is the scope — no additional filter needed
        return query;
      default:
        return query;
    }
  }

  /**
   * Build scope-specific column values for INSERT.
   */
  private buildScopeColumns(
    scope: PreferenceScope,
    scopeId: string,
  ): Record<string, string | null> {
    switch (scope) {
      case "user":
        return { user_principal_id: scopeId, org_unit_id: null };
      case "org_unit":
        return { user_principal_id: null, org_unit_id: scopeId };
      case "tenant":
        return { user_principal_id: null, org_unit_id: null };
      default:
        return { user_principal_id: null, org_unit_id: null };
    }
  }

  /**
   * Extract the scope ID from the appropriate typed column.
   */
  private extractScopeId(row: any): string {
    if (row.user_principal_id) return row.user_principal_id;
    if (row.org_unit_id) return row.org_unit_id;
    return row.tenant_id; // tenant scope uses tenant_id
  }

  private mapRow(row: any): ScopedPreferenceRow {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      scope: row.scope,
      scopeId: this.extractScopeId(row),
      eventCode: row.event_code,
      channel: row.channel,
      isEnabled: row.is_enabled,
      frequency: row.frequency,
      quietHours: this.parseJson(row.quiet_hours),
      metadata: this.parseJson(row.metadata),
      createdAt: new Date(row.created_at),
      createdByPrincipalId: row.created_by_principal_id ?? null,
      createdByService: row.created_by_service ?? null,
      updatedAt: row.updated_at ? new Date(row.updated_at) : null,
      updatedBy: row.updated_by,
    };
  }

  private parseJson(value: unknown): any {
    if (!value) return null;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value;
  }
}
