/**
 * DocRenderDlqEntry — Domain model for core.doc_render_dlq
 */

import type { OutputId, RenderJobId, DocErrorCode, DocErrorCategory } from "../types.js";

export interface DocRenderDlqEntry {
    id: string;
    tenantId: string;
    outputId: OutputId;
    renderJobId: RenderJobId | null;
    errorCode: DocErrorCode;
    errorDetail: string | null;
    errorCategory: DocErrorCategory;
    attemptCount: number;
    payload: Record<string, unknown>;
    replayedAt: Date | null;
    replayedBy: string | null;
    replayCount: number;
    deadAt: Date;
    createdAt: Date;
}

export interface CreateDlqEntryInput {
    tenantId: string;
    outputId: string;
    renderJobId?: string;
    errorCode: string;
    errorDetail?: string;
    errorCategory: string;
    attemptCount: number;
    payload: Record<string, unknown>;
}
