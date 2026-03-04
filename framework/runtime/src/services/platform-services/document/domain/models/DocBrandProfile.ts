/**
 * Brand Profile — palette, typography, spacing, RTL/LTR per tenant.
 */

import type { BrandProfileId, TextDirection } from "../types.js";

export interface BrandPalette {
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    background: string;
    border: string;
    [key: string]: string;
}

export interface BrandTypography {
    headingFont: string;
    bodyFont: string;
    sizes: {
        xs: string;
        sm: string;
        md: string;
        lg: string;
        xl: string;
        xxl: string;
    };
    lineHeight: number;
}

export interface SpacingScale {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
}

export interface DocBrandProfile {
    id: BrandProfileId;
    tenantId: string;
    code: string;
    name: string;
    palette: BrandPalette | null;
    typography: BrandTypography | null;
    spacingScale: SpacingScale | null;
    direction: TextDirection;
    defaultLocale: string;
    supportedLocales: string[];
    isDefault: boolean;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
    createdBy: string;
    updatedAt: Date | null;
    updatedBy: string | null;
}
