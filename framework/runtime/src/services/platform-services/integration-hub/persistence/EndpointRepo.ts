/**
 * Persistence — CRUD for wf.integration_endpoint.
 */

import type {
  IntegrationEndpoint,
  CreateEndpointInput,
  UpdateEndpointInput,
  RetryPolicy,
  RateLimitConfig,
} from "../domain/models/IntegrationEndpoint.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "wf.integration_endpoint" as keyof DB & string;

export class EndpointRepo {
  constructor(private readonly db: Kysely<DB>) {}

  async getById(
    tenantId: string,
    id: string,
  ): Promise<IntegrationEndpoint | undefined> {
    const row = await (this.db as any)
      .selectFrom(TABLE)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? this.mapRow(row) : undefined;
  }

  async getByCode(
    tenantId: string,
    code: string,
  ): Promise<IntegrationEndpoint | undefined> {
    const row = await (this.db as any)
      .selectFrom(TABLE)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("code", "=", code)
      .executeTakeFirst();
    return row ? this.mapRow(row) : undefined;
  }

  async list(
    tenantId: string,
    opts?: { isActive?: boolean; limit?: number; offset?: number },
  ): Promise<IntegrationEndpoint[]> {
    let q = (this.db as any)
      .selectFrom(TABLE)
      .selectAll()
      .where("tenant_id", "=", tenantId);

    if (opts?.isActive !== undefined) {
      q = q.where("is_active", "=", opts.isActive);
    }
    q = q.orderBy("created_at", "desc");
    if (opts?.limit) q = q.limit(opts.limit);
    if (opts?.offset) q = q.offset(opts.offset);

    const rows = await q.execute();
    return rows.map((r: any) => this.mapRow(r));
  }

  async create(input: CreateEndpointInput): Promise<IntegrationEndpoint> {
    const row = await (this.db as any)
      .insertInto(TABLE)
      .values({
        tenant_id: input.tenantId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        url: input.url,
        http_method: input.httpMethod ?? "POST",
        auth_type: input.authType ?? "NONE",
        auth_config: JSON.stringify(input.authConfig ?? {}),
        default_headers: JSON.stringify(input.defaultHeaders ?? {}),
        timeout_ms: input.timeoutMs ?? 30_000,
        retry_policy: JSON.stringify(
          input.retryPolicy ?? {
            maxRetries: 3,
            backoffMs: 1000,
            backoffMultiplier: 2,
          },
        ),
        rate_limit_config: input.rateLimitConfig
          ? JSON.stringify(input.rateLimitConfig)
          : null,
        created_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRow(row);
  }

  async update(
    tenantId: string,
    id: string,
    input: UpdateEndpointInput,
  ): Promise<void> {
    const values: Record<string, unknown> = {
      updated_at: new Date(),
      updated_by: input.updatedBy,
    };
    if (input.name !== undefined) values.name = input.name;
    if (input.description !== undefined) values.description = input.description;
    if (input.url !== undefined) values.url = input.url;
    if (input.httpMethod !== undefined) values.http_method = input.httpMethod;
    if (input.authType !== undefined) values.auth_type = input.authType;
    if (input.authConfig !== undefined)
      values.auth_config = JSON.stringify(input.authConfig);
    if (input.defaultHeaders !== undefined)
      values.default_headers = JSON.stringify(input.defaultHeaders);
    if (input.timeoutMs !== undefined) values.timeout_ms = input.timeoutMs;
    if (input.retryPolicy !== undefined)
      values.retry_policy = JSON.stringify(input.retryPolicy);
    if (input.rateLimitConfig !== undefined)
      values.rate_limit_config = input.rateLimitConfig
        ? JSON.stringify(input.rateLimitConfig)
        : null;
    if (input.isActive !== undefined) values.is_active = input.isActive;

    await (this.db as any)
      .updateTable(TABLE)
      .set(values)
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .execute();
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await (this.db as any)
      .deleteFrom(TABLE)
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .execute();
  }

  private mapRow(row: any): IntegrationEndpoint {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      code: row.code,
      name: row.name,
      description: row.description ?? null,
      url: row.url,
      httpMethod: row.http_method,
      authType: row.auth_type,
      authConfig: this.parseJson(row.auth_config) ?? {},
      defaultHeaders:
        (this.parseJson(row.default_headers) as Record<string, string>) ?? {},
      timeoutMs: row.timeout_ms,
      retryPolicy: (this.parseJson(row.retry_policy) as RetryPolicy | null) ?? {
        maxRetries: 3,
        backoffMs: 1000,
        backoffMultiplier: 2,
      },
      rateLimitConfig: this.parseJson(
        row.rate_limit_config,
      ) as RateLimitConfig | null,
      isActive: row.is_active,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
      updatedAt: row.updated_at ? new Date(row.updated_at) : null,
      updatedBy: row.updated_by ?? null,
    };
  }

  private parseJson(value: unknown): Record<string, unknown> | null {
    if (value == null) return null;
    if (typeof value === "object") return value as Record<string, unknown>;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return null;
  }
}
