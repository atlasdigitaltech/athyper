/**
 * Letterhead — tenant/org-unit scoped brand layer for documents.
 */

import type { LetterheadId } from "../types.js";

export interface PageMargins {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

export interface FontConfig {
    heading: string;
    body: string;
}

export interface DocLetterhead {
    id: LetterheadId;
    tenantId: string;
    code: string;
    name: string;
    orgUnitId: string | null;
    logoStorageKey: string | null;
    headerHtml: string | null;
    footerHtml: string | null;
    watermarkText: string | null;
    watermarkOpacity: number;
    defaultFonts: FontConfig | null;
    pageMargins: PageMargins | null;
    isDefault: boolean;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
    createdBy: string;
    updatedAt: Date | null;
    updatedBy: string | null;
}
