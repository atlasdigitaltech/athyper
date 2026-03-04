/**
 * WhatsAppTemplateSync — Sync approved WhatsApp message templates from Meta Business Manager.
 *
 * WhatsApp Business API requires pre-approved templates for business-initiated messages.
 * This service fetches the approved templates from the Cloud API and upserts them
 * into the notification_template table for use by the notification engine.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { NotificationTemplateRepo } from "../../persistence/NotificationTemplateRepo.js";

export interface WhatsAppTemplateSyncConfig {
    businessAccountId: string;
    accessTokenRef: string;
    apiVersion?: string;
}

export interface WhatsAppTemplateMeta {
    name: string;
    status: string;            // APPROVED, PENDING, REJECTED
    category: string;          // MARKETING, UTILITY, AUTHENTICATION
    language: string;          // en_US, etc.
    components: Array<{
        type: string;          // HEADER, BODY, FOOTER, BUTTONS
        text?: string;
        format?: string;
        buttons?: Array<{ type: string; text: string; url?: string }>;
    }>;
    id: string;
}

export class WhatsAppTemplateSync {
    private accessToken: string | undefined;
    private readonly apiBaseUrl: string;

    constructor(
        private readonly config: WhatsAppTemplateSyncConfig,
        private readonly templateRepo: NotificationTemplateRepo,
        private readonly logger: Logger,
    ) {
        this.accessToken = process.env[config.accessTokenRef];
        const version = config.apiVersion ?? "v21.0";
        this.apiBaseUrl = `https://graph.facebook.com/${version}/${config.businessAccountId}/message_templates`;
    }

    /**
     * Fetch all templates from Meta and upsert approved ones into the template repo.
     */
    async syncTemplates(tenantId: string): Promise<{
        synced: number;
        skipped: number;
        errors: string[];
    }> {
        if (!this.accessToken) {
            return { synced: 0, skipped: 0, errors: ["Access token not configured"] };
        }

        const result = { synced: 0, skipped: 0, errors: [] as string[] };

        try {
            const templates = await this.fetchTemplatesFromMeta();

            for (const template of templates) {
                if (template.status !== "APPROVED") {
                    result.skipped++;
                    continue;
                }

                try {
                    // Convert Meta language code (en_US) to BCP-47 (en-US)
                    const locale = template.language.replace("_", "-");

                    // Build body JSON with the full template structure
                    const bodyJson: Record<string, unknown> = {
                        type: "template",
                        name: template.name,
                        languageCode: locale,
                        category: template.category,
                        components: template.components,
                        metaTemplateId: template.id,
                    };

                    // Extract body text from BODY component for display purposes
                    const bodyComponent = template.components.find(
                        (c) => c.type === "BODY",
                    );
                    const bodyText = bodyComponent?.text ?? "";

                    await this.templateRepo.create({
                        tenantId,
                        templateKey: `whatsapp_${template.name}`,
                        channel: "WHATSAPP",
                        locale,
                        subject: undefined,
                        bodyText,
                        bodyHtml: undefined,
                        bodyJson,
                        variablesSchema: undefined,
                        metadata: {
                            metaTemplateId: template.id,
                            category: template.category,
                            syncedAt: new Date().toISOString(),
                        },
                        createdBy: "system:whatsapp_sync",
                    });

                    result.synced++;
                } catch (err) {
                    result.errors.push(
                        `Failed to upsert template '${template.name}': ${String(err)}`,
                    );
                }
            }

            this.logger.info(
                {
                    tenantId,
                    synced: result.synced,
                    skipped: result.skipped,
                    errors: result.errors.length,
                },
                "[notify:whatsapp] Template sync complete",
            );
        } catch (err) {
            this.logger.error(
                { error: String(err), tenantId },
                "[notify:whatsapp] Template sync failed",
            );
            result.errors.push(`Fetch from Meta failed: ${String(err)}`);
        }

        return result;
    }

    /**
     * List approved templates currently in the repo.
     */
    async listApproved(tenantId: string): Promise<Array<{
        templateKey: string;
        name: string;
        locale: string;
        category: string;
    }>> {
        const templates = await this.templateRepo.list({
            tenantId,
            channel: "WHATSAPP",
            status: "active",
            limit: 500,
            offset: 0,
        });

        return templates.map((t) => ({
            templateKey: t.templateKey,
            name: (t.bodyJson as Record<string, unknown>)?.name as string ?? t.templateKey,
            locale: t.locale,
            category: (t.metadata as Record<string, unknown>)?.category as string ?? "UNKNOWN",
        }));
    }

    /**
     * Fetch templates from Meta Cloud API with pagination.
     */
    private async fetchTemplatesFromMeta(): Promise<WhatsAppTemplateMeta[]> {
        const templates: WhatsAppTemplateMeta[] = [];
        let url: string | null = `${this.apiBaseUrl}?limit=100&status=APPROVED`;

        while (url) {
            const response = await fetch(url, {
                headers: {
                    "Authorization": `Bearer ${this.accessToken}`,
                },
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Meta API error (${response.status}): ${errorBody.substring(0, 500)}`);
            }

            const body = (await response.json()) as {
                data: WhatsAppTemplateMeta[];
                paging?: { next?: string };
            };

            templates.push(...body.data);

            // Follow pagination
            url = body.paging?.next ?? null;
        }

        return templates;
    }
}
