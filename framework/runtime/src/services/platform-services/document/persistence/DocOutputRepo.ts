/**
 * DocOutputRepo — Kysely repo for core.doc_output
 */

import { isValidOutputTransition } from "../domain/types.js";

import type { DocOutput } from "../domain/models/DocOutput.js";
import type { OutputId, OutputStatus, OutputListFilters } from "../domain/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "doc.render_output" as keyof DB & string;

export interface CreateOutputInput {
    tenantId: string;
    templateVersionId?: string;
    letterheadId?: string;
    brandProfileId?: string;
    entityName: string;
    entityId: string;
    operation: string;
    variant?: string;
    locale?: string;
    timezone?: string;
    manifestJson: Record<string, unknown>;
    inputPayloadHash?: string;
    replacesOutputId?: string;
    createdBy: string;
}

export class DocOutputRepo {
    constructor(private readonly db: Kysely<DB>) {}

    async getById(id: OutputId): Promise<DocOutput | undefined> {
        const row = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("id", "=", id)
            .executeTakeFirst();
        return row ? this.mapRow(row) : undefined;
    }

    async listByEntity(
        tenantId: string,
        entityName: string,
        entityId: string,
    ): Promise<DocOutput[]> {
        const rows = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("entity_name", "=", entityName)
            .where("entity_id", "=", entityId)
            .orderBy("created_at", "desc")
            .execute();
        return rows.map((r: any) => this.mapRow(r));
    }

    async list(tenantId: string, filters?: OutputListFilters): Promise<DocOutput[]> {
        let query = this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId);

        if (filters?.entityName) {
            query = query.where("entity_name", "=", filters.entityName);
        }
        if (filters?.entityId) {
            query = query.where("entity_id", "=", filters.entityId);
        }
        if (filters?.status) {
            query = query.where("status", "=", filters.status);
        }
        if (filters?.operation) {
            query = query.where("operation", "=", filters.operation);
        }

        query = query
            .orderBy("created_at", "desc")
            .limit(filters?.limit ?? 100)
            .offset(filters?.offset ?? 0);

        const rows = await query.execute();
        return rows.map((r: any) => this.mapRow(r));
    }

    async listByStatus(tenantId: string, status: OutputStatus): Promise<DocOutput[]> {
        const rows = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("status", "=", status)
            .orderBy("created_at", "desc")
            .execute();
        return rows.map((r: any) => this.mapRow(r));
    }

    async create(input: CreateOutputInput): Promise<DocOutput> {
        const id = crypto.randomUUID();
        const now = new Date();

        await this.db
            .insertInto(TABLE as any)
            .values({
                id,
                tenant_id: input.tenantId,
                template_version_id: input.templateVersionId ?? null,
                letterhead_id: input.letterheadId ?? null,
                brand_profile_id: input.brandProfileId ?? null,
                entity_name: input.entityName,
                entity_id: input.entityId,
                operation: input.operation,
                variant: input.variant ?? "default",
                locale: input.locale ?? "en",
                timezone: input.timezone ?? "UTC",
                status: "QUEUED",
                manifest_json: JSON.stringify(input.manifestJson),
                input_payload_hash: input.inputPayloadHash ?? null,
                replaces_output_id: input.replacesOutputId ?? null,
                created_at: now,
                created_by: input.createdBy,
            })
            .execute();

        const row = await this.getById(id as OutputId);
        return row!;
    }

    async updateStatus(
        id: OutputId,
        status: OutputStatus,
        extra?: Record<string, unknown>,
    ): Promise<void> {
        // Enforce status state machine — fetch current status first
        const current = await this.getById(id);
        if (!current) {
            throw new Error(`Output not found: ${id}`);
        }
        if (!isValidOutputTransition(current.status, status)) {
            throw new Error(
                `Invalid output status transition: ${current.status} → ${status} (output=${id})`,
            );
        }

        const data: Record<string, unknown> = { status };

        if (extra) {
            Object.assign(data, extra);
        }

        // Set lifecycle timestamps based on status
        if (status === "RENDERED") data.rendered_at = new Date();
        if (status === "DELIVERED") data.delivered_at = new Date();
        if (status === "ARCHIVED") data.archived_at = new Date();

        await this.db
            .updateTable(TABLE as any)
            .set(data)
            .where("id", "=", id)
            .execute();
    }

    /** Find an in-flight output (QUEUED or RENDERING) that matches the idempotency key. */
    async findInFlight(
        tenantId: string,
        templateVersionId: string,
        entityName: string,
        entityId: string,
        operation: string,
        inputPayloadHash: string,
    ): Promise<DocOutput | undefined> {
        const row = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("template_version_id", "=", templateVersionId)
            .where("entity_name", "=", entityName)
            .where("entity_id", "=", entityId)
            .where("operation", "=", operation)
            .where("input_payload_hash", "=", inputPayloadHash)
            .where("status", "in", ["QUEUED", "RENDERING"])
            .executeTakeFirst();
        return row ? this.mapRow(row) : undefined;
    }

    /** Find outputs stuck in RENDERING status older than the given threshold. */
    async findStuckRendering(olderThanMs: number): Promise<DocOutput[]> {
        const cutoff = new Date(Date.now() - olderThanMs);
        const rows = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("status", "=", "RENDERING")
            .where("created_at", "<", cutoff)
            .limit(100)
            .execute();
        return rows.map((r: any) => this.mapRow(r));
    }

    async getByChecksum(tenantId: string, checksum: string): Promise<DocOutput | undefined> {
        const row = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("checksum", "=", checksum)
            .executeTakeFirst();
        return row ? this.mapRow(row) : undefined;
    }

    private mapRow(row: any): DocOutput {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            templateVersionId: row.template_version_id,
            letterheadId: row.letterhead_id,
            brandProfileId: row.brand_profile_id,
            entityName: row.entity_name,
            entityId: row.entity_id,
            operation: row.operation,
            variant: row.variant,
            locale: row.locale,
            timezone: row.timezone,
            status: row.status,
            storageKey: row.storage_key,
            mimeType: row.mime_type,
            sizeBytes: row.size_bytes ? Number(row.size_bytes) : null,
            checksum: row.checksum,
            manifestJson: this.parseJson(row.manifest_json) as any,
            inputPayloadHash: row.input_payload_hash,
            replacesOutputId: row.replaces_output_id,
            errorCode: row.error_code ?? null,
            errorMessage: row.error_message,
            storageBucket: row.storage_bucket ?? null,
            storageVersionId: row.storage_version_id ?? null,
            manifestVersion: row.manifest_version ?? 1,
            renderedAt: row.rendered_at ? new Date(row.rendered_at) : null,
            deliveredAt: row.delivered_at ? new Date(row.delivered_at) : null,
            archivedAt: row.archived_at ? new Date(row.archived_at) : null,
            revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
            revokedBy: row.revoked_by,
            revokeReason: row.revoke_reason,
            createdAt: new Date(row.created_at),
            createdBy: row.created_by,
        };
    }

    private parseJson(value: unknown): Record<string, unknown> | null {
        if (!value) return null;
        if (typeof value === "string") {
            try { return JSON.parse(value); } catch { return null; }
        }
        return value as Record<string, unknown>;
    }
}
