/**
 * NotificationTemplate — Versioned, localized, multi-format templates.
 *
 * Templates are resolved by (template_key, channel, locale, status=active).
 * Tenant-specific overrides take precedence over system templates.
 */

import type {
    TemplateId,
    ChannelCode,
    TemplateStatus,
} from "../types.js";

export interface NotificationTemplate {
    id: TemplateId;
    tenantId: string | null;
    templateKey: string;
    channel: ChannelCode;
    locale: string;
    version: number;
    status: TemplateStatus;
    subject: string | null;
    bodyText: string | null;
    bodyHtml: string | null;
    bodyJson: Record<string, unknown> | null;
    variablesSchema: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
    createdBy: string;
    updatedAt: Date | null;
    updatedBy: string | null;
}

export interface CreateTemplateInput {
    tenantId?: string;
    templateKey: string;
    channel: ChannelCode;
    locale?: string;
    version?: number;
    status?: TemplateStatus;
    subject?: string;
    bodyText?: string;
    bodyHtml?: string;
    bodyJson?: Record<string, unknown>;
    variablesSchema?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    createdBy: string;
}

export interface UpdateTemplateInput {
    status?: TemplateStatus;
    subject?: string;
    bodyText?: string;
    bodyHtml?: string;
    bodyJson?: Record<string, unknown>;
    variablesSchema?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    updatedBy: string;
}
