/**
 * Document Output — immutable rendered document record with full lifecycle.
 */

import type {
    OutputId,
    TemplateVersionId,
    LetterheadId,
    BrandProfileId,
    OutputStatus,
    DocErrorCode,
    RenderManifest,
} from "../types.js";

export interface DocOutput {
    id: OutputId;
    tenantId: string;
    templateVersionId: TemplateVersionId | null;
    letterheadId: LetterheadId | null;
    brandProfileId: BrandProfileId | null;
    entityName: string;
    entityId: string;
    operation: string;
    variant: string;
    locale: string;
    timezone: string;
    status: OutputStatus;
    storageKey: string | null;
    mimeType: string;
    sizeBytes: number | null;
    checksum: string | null;
    manifestJson: RenderManifest;
    inputPayloadHash: string | null;
    replacesOutputId: OutputId | null;
    errorCode: DocErrorCode | null;
    errorMessage: string | null;
    storageBucket: string | null;
    storageVersionId: string | null;
    manifestVersion: number;
    renderedAt: Date | null;
    deliveredAt: Date | null;
    archivedAt: Date | null;
    revokedAt: Date | null;
    revokedBy: string | null;
    revokeReason: string | null;
    createdAt: Date;
    createdBy: string;
}
