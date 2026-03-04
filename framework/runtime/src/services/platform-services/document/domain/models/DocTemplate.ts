/**
 * Document Template + Version domain models.
 */

import type {
    TemplateId,
    TemplateVersionId,
    TemplateKind,
    TemplateEngine,
    TemplateStatus,
} from "../types.js";

export interface DocTemplate {
    id: TemplateId;
    tenantId: string;
    code: string;
    name: string;
    kind: TemplateKind;
    engine: TemplateEngine;
    status: TemplateStatus;
    currentVersionId: TemplateVersionId | null;
    metadata: Record<string, unknown> | null;
    supportsRtl: boolean;
    requiresLetterhead: boolean;
    allowedOperations: string[] | null;
    supportedLocales: string[] | null;
    createdAt: Date;
    createdBy: string;
    updatedAt: Date | null;
    updatedBy: string | null;
}

export interface DocTemplateVersion {
    id: TemplateVersionId;
    tenantId: string;
    templateId: TemplateId;
    version: number;
    contentHtml: string | null;
    contentJson: Record<string, unknown> | null;
    headerHtml: string | null;
    footerHtml: string | null;
    stylesCss: string | null;
    variablesSchema: Record<string, unknown> | null;
    assetsManifest: Record<string, string> | null;
    checksum: string;
    publishedAt: Date | null;
    publishedBy: string | null;
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
    createdAt: Date;
    createdBy: string;
}
