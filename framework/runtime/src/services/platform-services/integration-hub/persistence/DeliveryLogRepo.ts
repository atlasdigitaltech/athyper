/**
 * Persistence — append-only delivery log for wf.delivery_log.
 */

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "wf.delivery_log" as keyof DB & string;

export interface DeliveryLogEntry {
    id: string;
    tenantId: string;
    endpointId: string | null;
    outboxItemId: string | null;
    requestUrl: string;
    requestMethod: string;
    requestHeaders: Record<string, string> | null;
    requestBody: unknown;
    responseStatus: number | null;
    responseHeaders: Record<string, string> | null;
    responseBody: string | null;
    durationMs: number;
    success: boolean;
    error: string | null;
    createdAt: Date;
}

export interface AppendDeliveryLogInput {
    tenantId: string;
    endpointId: string | null;
    outboxItemId: string | null;
    requestUrl: string;
    requestMethod: string;
    requestHeaders: Record<string, string> | null;
    requestBody: unknown;
    responseStatus: number | null;
    responseHeaders: Record<string, string> | null;
    responseBody: string | null;
    durationMs: number;
    success: boolean;
    error: string | null;
}

export class DeliveryLogRepo {
    constructor(private readonly db: Kysely<DB>) {}

    async append(input: AppendDeliveryLogInput): Promise<{ id: string }> {
        const row = await (this.db as any)
            .insertInto(TABLE)
            .values({
                tenant_id: input.tenantId,
                endpoint_id: input.endpointId,
                outbox_item_id: input.outboxItemId,
                request_url: input.requestUrl,
                request_method: input.requestMethod,
                request_headers: input.requestHeaders ? JSON.stringify(input.requestHeaders) : null,
                request_body: input.requestBody != null ? JSON.stringify(input.requestBody) : null,
                response_status: input.responseStatus,
                response_headers: input.responseHeaders ? JSON.stringify(input.responseHeaders) : null,
                response_body: input.responseBody,
                duration_ms: input.durationMs,
                success: input.success,
                error: input.error,
            })
            .returning("id")
            .executeTakeFirstOrThrow();

        return { id: row.id };
    }

    async listByEndpoint(
        tenantId: string,
        endpointId: string,
        opts?: { limit?: number; offset?: number },
    ): Promise<DeliveryLogEntry[]> {
        let q = (this.db as any)
            .selectFrom(TABLE)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("endpoint_id", "=", endpointId)
            .orderBy("created_at", "desc");

        if (opts?.limit) q = q.limit(opts.limit);
        if (opts?.offset) q = q.offset(opts.offset);

        const rows = await q.execute();
        return rows.map((r: any) => this.mapRow(r));
    }

    async listByOutboxItem(tenantId: string, outboxItemId: string): Promise<DeliveryLogEntry[]> {
        const rows = await (this.db as any)
            .selectFrom(TABLE)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("outbox_item_id", "=", outboxItemId)
            .orderBy("created_at", "desc")
            .execute();

        return rows.map((r: any) => this.mapRow(r));
    }

    private mapRow(row: any): DeliveryLogEntry {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            endpointId: row.endpoint_id ?? null,
            outboxItemId: row.outbox_item_id ?? null,
            requestUrl: row.request_url,
            requestMethod: row.request_method,
            requestHeaders: this.parseJson(row.request_headers),
            requestBody: this.parseJson(row.request_body),
            responseStatus: row.response_status ?? null,
            responseHeaders: this.parseJson(row.response_headers),
            responseBody: row.response_body ?? null,
            durationMs: row.duration_ms,
            success: row.success,
            error: row.error ?? null,
            createdAt: new Date(row.created_at),
        };
    }

    private parseJson(value: unknown): any {
        if (value == null) return null;
        if (typeof value === "object") return value;
        if (typeof value === "string") {
            try { return JSON.parse(value); } catch { return null; }
        }
        return null;
    }
}
