/**
 * Audit Logger Service Implementation
 *
 * PostgreSQL-backed audit logging for META Engine.
 * Records all metadata changes and policy decisions.
 */

import type { DB } from "@athyper/adapter-db";
import type {
  AuditEvent,
  AuditLogger,
  AuditQueryFilters,
  HealthCheckResult,
  ListOptions,
  PaginatedResponse,
} from "@athyper/core/meta";
import type { Kysely } from "kysely";

/**
 * Audit Logger Service
 * Implements append-only audit logging to PostgreSQL
 */
export class AuditLoggerService implements AuditLogger {
  constructor(private readonly db: Kysely<DB>) {}

  async log(
    event: Omit<AuditEvent, "eventId" | "timestamp">
  ): Promise<void> {
    await this.db
      .insertInto("audit.audit_log")
      .values({
        id: crypto.randomUUID(),
        tenant_id: event.tenantId,
        actor_id: event.userId,
        actor_type: event.eventType ?? "user",
        action: event.action,
        entity_name: event.resource ?? null,
        correlation_id: event.realmId ?? null,
        payload: event.details ? JSON.stringify(event.details) : null,
      })
      .execute();
  }

  async query(
    filters: AuditQueryFilters
  ): Promise<PaginatedResponse<AuditEvent>> {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 20, 100);
    const offset = (page - 1) * pageSize;

    // Build query
    let query = this.db.selectFrom("audit.audit_log").selectAll();

    // Apply filters
    if (filters.eventType) {
      if (Array.isArray(filters.eventType)) {
        query = query.where("actor_type", "in", filters.eventType);
      } else {
        query = query.where("actor_type", "=", filters.eventType);
      }
    }

    if (filters.userId) {
      query = query.where("actor_id", "=", filters.userId);
    }

    if (filters.tenantId) {
      query = query.where("tenant_id", "=", filters.tenantId);
    }

    if (filters.resource) {
      query = query.where("entity_name", "=", filters.resource);
    }

    if (filters.startDate) {
      query = query.where("occurred_at", ">=", filters.startDate);
    }

    if (filters.endDate) {
      query = query.where("occurred_at", "<=", filters.endDate);
    }

    // Order by occurred_at desc
    query = query.orderBy("occurred_at", "desc");

    // Execute count and data queries
    const [countResult, data] = await Promise.all([
      this.db
        .selectFrom("audit.audit_log")
        .select((eb) => eb.fn.countAll().as("count"))
        .executeTakeFirstOrThrow(),
      query.limit(pageSize).offset(offset).execute(),
    ]);

    const total = Number(countResult.count);
    const totalPages = Math.ceil(total / pageSize);

    return {
      data: data.map((e) => this.mapEventFromDb(e)),
      meta: {
        page,
        pageSize,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async getEvent(eventId: string): Promise<AuditEvent | undefined> {
    const event = await this.db
      .selectFrom("audit.audit_log")
      .selectAll()
      .where("id", "=", eventId)
      .executeTakeFirst();

    return event ? this.mapEventFromDb(event) : undefined;
  }

  async getRecent(limit: number = 10): Promise<AuditEvent[]> {
    const events = await this.db
      .selectFrom("audit.audit_log")
      .selectAll()
      .orderBy("occurred_at", "desc")
      .limit(Math.min(limit, 100))
      .execute();

    return events.map((e) => this.mapEventFromDb(e));
  }

  async getResourceAudit(
    resource: string,
    options: ListOptions = {}
  ): Promise<PaginatedResponse<AuditEvent>> {
    return this.query({
      resource,
      page: options.page,
      pageSize: options.pageSize,
    });
  }

  async getUserAudit(
    userId: string,
    options: ListOptions = {}
  ): Promise<PaginatedResponse<AuditEvent>> {
    return this.query({
      userId,
      page: options.page,
      pageSize: options.pageSize,
    });
  }

  async getTenantAudit(
    tenantId: string,
    options: ListOptions = {}
  ): Promise<PaginatedResponse<AuditEvent>> {
    return this.query({
      tenantId,
      page: options.page,
      pageSize: options.pageSize,
    });
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      // Try to query the audit table
      await this.db
        .selectFrom("audit.audit_log")
        .select((eb) => eb.fn.countAll().as("count"))
        .executeTakeFirst();

      return {
        healthy: true,
        message: "Audit Logger healthy",
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Audit Logger unhealthy: ${String(error)}`,
        details: { error: String(error) },
      };
    }
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private mapEventFromDb(dbEvent: any): AuditEvent {
    return {
      eventId: dbEvent.id,
      eventType: dbEvent.actor_type,
      timestamp: new Date(dbEvent.occurred_at),
      userId: dbEvent.actor_id,
      tenantId: dbEvent.tenant_id,
      realmId: dbEvent.correlation_id ?? "default",
      action: dbEvent.action,
      resource: dbEvent.entity_name,
      details:
        typeof dbEvent.payload === "string"
          ? JSON.parse(dbEvent.payload)
          : dbEvent.payload,
      result: "success",
      errorMessage: undefined,
    };
  }
}
