/**
 * NotificationTemplateRepo — Kysely repo for notify.notification_template
 */

import type {
    NotificationTemplate,
    CreateTemplateInput,
    UpdateTemplateInput,
} from "../domain/models/NotificationTemplate.js";
import type { TemplateId, ChannelCode, TemplateStatus } from "../domain/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "notify.notification_template" as keyof DB & string;

export class NotificationTemplateRepo {
    constructor(private readonly db: Kysely<DB>) {}

    async getById(id: TemplateId): Promise<NotificationTemplate | undefined> {
        const row = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("id", "=", id)
            .executeTakeFirst();

        return row ? this.mapRow(row) : undefined;
    }

    /**
     * Resolve the active template for a given key/channel/locale.
     * Resolution chain:
     * 1. Tenant-specific active template (highest version)
     * 2. System template (tenant_id IS NULL, active, highest version)
     * 3. Locale fallback: e.g. "ar-SA" → "ar" → "en"
     */
    async resolve(
        templateKey: string,
        channel: ChannelCode,
        locale: string,
        tenantId?: string,
    ): Promise<NotificationTemplate | undefined> {
        // Build locale fallback chain: "ar-SA" → "ar" → "en"
        const locales = this.buildLocaleFallbackChain(locale);

        for (const loc of locales) {
            // Try tenant-specific first
            if (tenantId) {
                const tenantRow = await this.db
                    .selectFrom(TABLE as any)
                    .selectAll()
                    .where("tenant_id", "=", tenantId)
                    .where("template_key", "=", templateKey)
                    .where("channel", "=", channel)
                    .where("locale", "=", loc)
                    .where("status", "=", "active")
                    .orderBy("version", "desc")
                    .executeTakeFirst();

                if (tenantRow) return this.mapRow(tenantRow);
            }

            // Try system template
            const systemRow = await this.db
                .selectFrom(TABLE as any)
                .selectAll()
                .where("tenant_id", "is", null)
                .where("template_key", "=", templateKey)
                .where("channel", "=", channel)
                .where("locale", "=", loc)
                .where("status", "=", "active")
                .orderBy("version", "desc")
                .executeTakeFirst();

            if (systemRow) return this.mapRow(systemRow);
        }

        return undefined;
    }

    async list(
        options?: {
            tenantId?: string;
            templateKey?: string;
            channel?: ChannelCode;
            status?: TemplateStatus;
            limit?: number;
            offset?: number;
        },
    ): Promise<NotificationTemplate[]> {
        let query = this.db
            .selectFrom(TABLE as any)
            .selectAll();

        if (options?.tenantId) {
            query = query.where((eb: any) =>
                eb.or([
                    eb("tenant_id", "is", null),
                    eb("tenant_id", "=", options.tenantId),
                ]),
            );
        }
        if (options?.templateKey) {
            query = query.where("template_key", "=", options.templateKey);
        }
        if (options?.channel) {
            query = query.where("channel", "=", options.channel);
        }
        if (options?.status) {
            query = query.where("status", "=", options.status);
        }

        query = query
            .orderBy("template_key", "asc")
            .orderBy("channel", "asc")
            .orderBy("locale", "asc")
            .orderBy("version", "desc");

        query = query.limit(options?.limit ?? 100).offset(options?.offset ?? 0);

        const rows = await query.execute();
        return rows.map((r: any) => this.mapRow(r));
    }

    async create(input: CreateTemplateInput): Promise<NotificationTemplate> {
        const id = crypto.randomUUID();
        const now = new Date();

        await this.db
            .insertInto(TABLE as any)
            .values({
                id,
                tenant_id: input.tenantId ?? null,
                template_key: input.templateKey,
                channel: input.channel,
                locale: input.locale ?? "en",
                version: input.version ?? 1,
                status: input.status ?? "draft",
                subject: input.subject ?? null,
                body_text: input.bodyText ?? null,
                body_html: input.bodyHtml ?? null,
                body_json: input.bodyJson ? JSON.stringify(input.bodyJson) : null,
                variables_schema: input.variablesSchema ? JSON.stringify(input.variablesSchema) : null,
                metadata: input.metadata ? JSON.stringify(input.metadata) : null,
                created_at: now,
                created_by: input.createdBy,
            })
            .execute();

        return {
            id: id as TemplateId,
            tenantId: input.tenantId ?? null,
            templateKey: input.templateKey,
            channel: input.channel,
            locale: input.locale ?? "en",
            version: input.version ?? 1,
            status: input.status ?? "draft",
            subject: input.subject ?? null,
            bodyText: input.bodyText ?? null,
            bodyHtml: input.bodyHtml ?? null,
            bodyJson: input.bodyJson ?? null,
            variablesSchema: input.variablesSchema ?? null,
            metadata: input.metadata ?? null,
            createdAt: now,
            createdBy: input.createdBy,
            updatedAt: null,
            updatedBy: null,
        };
    }

    async update(id: TemplateId, input: UpdateTemplateInput): Promise<void> {
        const data: Record<string, unknown> = {
            updated_at: new Date(),
            updated_by: input.updatedBy,
        };

        if (input.status !== undefined) data.status = input.status;
        if (input.subject !== undefined) data.subject = input.subject;
        if (input.bodyText !== undefined) data.body_text = input.bodyText;
        if (input.bodyHtml !== undefined) data.body_html = input.bodyHtml;
        if (input.bodyJson !== undefined) data.body_json = JSON.stringify(input.bodyJson);
        if (input.variablesSchema !== undefined) data.variables_schema = JSON.stringify(input.variablesSchema);
        if (input.metadata !== undefined) data.metadata = JSON.stringify(input.metadata);

        await this.db
            .updateTable(TABLE as any)
            .set(data)
            .where("id", "=", id)
            .execute();
    }

    /**
     * Retire all active versions of a template key/channel/locale,
     * then activate the specified version.
     */
    async publish(id: TemplateId, tenantId: string | null, updatedBy: string): Promise<void> {
        const template = await this.getById(id);
        if (!template) throw new Error(`Template not found: ${id}`);

        await this.db.transaction().execute(async (trx) => {
            // Retire currently active versions for this key/channel/locale
            let retireQuery = trx
                .updateTable(TABLE as any)
                .set({ status: "retired", updated_at: new Date(), updated_by: updatedBy })
                .where("template_key", "=", template.templateKey)
                .where("channel", "=", template.channel)
                .where("locale", "=", template.locale)
                .where("status", "=", "active");

            if (tenantId) {
                retireQuery = retireQuery.where("tenant_id", "=", tenantId);
            } else {
                retireQuery = retireQuery.where("tenant_id", "is", null);
            }

            await retireQuery.execute();

            // Activate this version
            await trx
                .updateTable(TABLE as any)
                .set({ status: "active", updated_at: new Date(), updated_by: updatedBy })
                .where("id", "=", id)
                .execute();
        });
    }

    /**
     * Get the next version number for a template key/channel/locale.
     */
    async getNextVersion(
        templateKey: string,
        channel: ChannelCode,
        locale: string,
        tenantId?: string,
    ): Promise<number> {
        let query = this.db
            .selectFrom(TABLE as any)
            .select((eb: any) => eb.fn.max("version").as("max_version"))
            .where("template_key", "=", templateKey)
            .where("channel", "=", channel)
            .where("locale", "=", locale);

        if (tenantId) {
            query = query.where("tenant_id", "=", tenantId);
        } else {
            query = query.where("tenant_id", "is", null);
        }

        const result = await query.executeTakeFirst();
        return ((result as any)?.max_version ?? 0) + 1;
    }

    private buildLocaleFallbackChain(locale: string): string[] {
        const chain: string[] = [locale];
        // "ar-SA" → also try "ar"
        if (locale.includes("-")) {
            chain.push(locale.split("-")[0]);
        }
        // Always fallback to "en"
        if (!chain.includes("en")) {
            chain.push("en");
        }
        return chain;
    }

    private mapRow(row: any): NotificationTemplate {
        return {
            id: row.id as TemplateId,
            tenantId: row.tenant_id,
            templateKey: row.template_key,
            channel: row.channel,
            locale: row.locale,
            version: row.version,
            status: row.status,
            subject: row.subject,
            bodyText: row.body_text,
            bodyHtml: row.body_html,
            bodyJson: this.parseJson(row.body_json),
            variablesSchema: this.parseJson(row.variables_schema),
            metadata: this.parseJson(row.metadata),
            createdAt: new Date(row.created_at),
            createdBy: row.created_by,
            updatedAt: row.updated_at ? new Date(row.updated_at) : null,
            updatedBy: row.updated_by,
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
