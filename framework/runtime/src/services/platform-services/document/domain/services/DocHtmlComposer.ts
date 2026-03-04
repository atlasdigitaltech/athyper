/**
 * DocHtmlComposer — Composes full HTML documents from template parts.
 *
 * Handles Handlebars compilation, variable substitution, header/footer injection,
 * brand CSS generation, RTL direction attribute, and locale-aware formatting.
 */

import Handlebars from "handlebars";

import type { Logger } from "../../../../../kernel/logger.js";
import type { DocBrandProfile } from "../models/DocBrandProfile.js";
import type { DocLetterhead } from "../models/DocLetterhead.js";
import type { DocTemplateVersion } from "../models/DocTemplate.js";

export interface ComposeOptions {
    locale: string;
    timezone: string;
}

interface CacheEntry {
    compiled: HandlebarsTemplateDelegate;
    accessedAt: number;
}

const DEFAULT_CACHE_MAX_SIZE = 500;
const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export class DocHtmlComposer {
    private readonly compiledCache = new Map<string, CacheEntry>();
    private readonly cacheMaxSize: number;
    private readonly cacheTtlMs: number;

    constructor(
        private readonly logger: Logger,
        cacheMaxSize = DEFAULT_CACHE_MAX_SIZE,
        cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    ) {
        this.cacheMaxSize = cacheMaxSize;
        this.cacheTtlMs = cacheTtlMs;
        this.registerHelpers();
    }

    compose(
        templateVersion: DocTemplateVersion,
        letterhead: DocLetterhead | null,
        brandProfile: DocBrandProfile | null,
        variables: Record<string, unknown>,
        options: ComposeOptions,
    ): string {
        // 0. Validate variables against template schema if defined
        this.validateVariables(templateVersion, variables);

        // 1. Compile and render body
        const bodyHtml = this.renderTemplate(
            templateVersion.contentHtml ?? "",
            variables,
            `tpl:${templateVersion.templateId}:v${templateVersion.version}:body`,
        );

        // 2. Compile and render header/footer from template + letterhead
        const headerHtml = this.composeHeader(templateVersion, letterhead, variables);
        const footerHtml = this.composeFooter(templateVersion, letterhead, variables);

        // 3. Generate brand CSS
        const brandCss = this.generateBrandCss(brandProfile);

        // 4. Compose scoped styles
        const scopedCss = templateVersion.stylesCss ?? "";

        // 5. Determine text direction
        const direction = brandProfile?.direction ?? "LTR";
        const lang = options.locale.split("-")[0];

        // 6. Build watermark overlay
        const watermarkHtml = this.buildWatermarkHtml(letterhead);

        // 7. Assemble full HTML document
        const html = `<!DOCTYPE html>
<html lang="${lang}" dir="${direction.toLowerCase()}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        ${this.getBaseStyles()}
        ${brandCss}
        ${scopedCss}
    </style>
</head>
<body>
    ${watermarkHtml}
    <div class="doc-header">${headerHtml}</div>
    <div class="doc-body">${bodyHtml}</div>
    <div class="doc-footer">${footerHtml}</div>
</body>
</html>`;

        this.logger.debug(
            { templateId: templateVersion.templateId, version: templateVersion.version, htmlLength: html.length },
            "[doc:composer] HTML composed",
        );

        return html;
    }

    private composeHeader(
        templateVersion: DocTemplateVersion,
        letterhead: DocLetterhead | null,
        variables: Record<string, unknown>,
    ): string {
        // Letterhead header takes precedence, template header supplements
        const letterheadHeader = letterhead?.headerHtml
            ? this.renderTemplate(letterhead.headerHtml, variables, "letterhead:header")
            : "";
        const templateHeader = templateVersion.headerHtml
            ? this.renderTemplate(templateVersion.headerHtml, variables, "tpl:header")
            : "";

        return letterheadHeader || templateHeader;
    }

    private composeFooter(
        templateVersion: DocTemplateVersion,
        letterhead: DocLetterhead | null,
        variables: Record<string, unknown>,
    ): string {
        const letterheadFooter = letterhead?.footerHtml
            ? this.renderTemplate(letterhead.footerHtml, variables, "letterhead:footer")
            : "";
        const templateFooter = templateVersion.footerHtml
            ? this.renderTemplate(templateVersion.footerHtml, variables, "tpl:footer")
            : "";

        return letterheadFooter || templateFooter;
    }

    private renderTemplate(
        source: string,
        variables: Record<string, unknown>,
        cacheKey: string,
    ): string {
        try {
            const now = Date.now();
            let entry = this.compiledCache.get(cacheKey);

            // TTL check — expired entries are recompiled
            if (entry && (now - entry.accessedAt) > this.cacheTtlMs) {
                this.compiledCache.delete(cacheKey);
                entry = undefined;
            }

            if (!entry) {
                // Evict oldest entries if at capacity
                if (this.compiledCache.size >= this.cacheMaxSize) {
                    this.evictOldest();
                }
                const compiled = Handlebars.compile(source, { strict: false });
                entry = { compiled, accessedAt: now };
                this.compiledCache.set(cacheKey, entry);
            } else {
                entry.accessedAt = now;
            }

            return entry.compiled(variables);
        } catch (error) {
            this.logger.warn(
                { cacheKey, error: String(error) },
                "[doc:composer] Template render error, returning raw source",
            );
            return source;
        }
    }

    /** Evict the 25% least recently accessed entries when cache is full. */
    private evictOldest(): void {
        const entries = [...this.compiledCache.entries()]
            .sort((a, b) => a[1].accessedAt - b[1].accessedAt);
        const evictCount = Math.max(1, Math.floor(entries.length * 0.25));
        for (let i = 0; i < evictCount; i++) {
            this.compiledCache.delete(entries[i][0]);
        }
        this.logger.debug(
            { evicted: evictCount, remaining: this.compiledCache.size },
            "[doc:composer] Cache eviction completed",
        );
    }

    private generateBrandCss(profile: DocBrandProfile | null): string {
        if (!profile) return "";

        const vars: string[] = [];

        if (profile.palette) {
            for (const [key, value] of Object.entries(profile.palette)) {
                vars.push(`--brand-${key}: ${value};`);
            }
        }

        if (profile.typography) {
            vars.push(`--font-heading: ${profile.typography.headingFont};`);
            vars.push(`--font-body: ${profile.typography.bodyFont};`);
            vars.push(`--line-height: ${profile.typography.lineHeight};`);
            if (profile.typography.sizes) {
                for (const [key, value] of Object.entries(profile.typography.sizes)) {
                    vars.push(`--font-size-${key}: ${value};`);
                }
            }
        }

        if (profile.spacingScale) {
            for (const [key, value] of Object.entries(profile.spacingScale)) {
                vars.push(`--spacing-${key}: ${value};`);
            }
        }

        return `:root {\n    ${vars.join("\n    ")}\n}\nbody {\n    font-family: var(--font-body, sans-serif);\n    line-height: var(--line-height, 1.5);\n    color: var(--brand-text, #000);\n}\nh1, h2, h3, h4, h5, h6 {\n    font-family: var(--font-heading, sans-serif);\n}`;
    }

    private buildWatermarkHtml(letterhead: DocLetterhead | null): string {
        if (!letterhead?.watermarkText) return "";

        const opacity = letterhead.watermarkOpacity ?? 0.15;
        return `<div class="doc-watermark" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-45deg);font-size:80px;opacity:${opacity};z-index:-1;pointer-events:none;user-select:none;color:#888;">${letterhead.watermarkText}</div>`;
    }

    private getBaseStyles(): string {
        return `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-size: 12pt; }
.doc-header { margin-bottom: 20px; }
.doc-body { min-height: 600px; }
.doc-footer { margin-top: 20px; border-top: 1px solid #ccc; padding-top: 10px; font-size: 9pt; color: #666; }
table { width: 100%; border-collapse: collapse; }
table th, table td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
table th { background: #f5f5f5; font-weight: 600; }
[dir="rtl"] table th, [dir="rtl"] table td { text-align: right; }
`;
    }

    /**
     * Validates input variables against the template's variablesSchema.
     * The schema is a JSON object with optional `required` (string[]) and
     * `properties` (Record<string, {type: string}>) fields.
     * Throws on validation failure.
     */
    private validateVariables(
        templateVersion: DocTemplateVersion,
        variables: Record<string, unknown>,
    ): void {
        const schema = templateVersion.variablesSchema;
        if (!schema) return; // no schema defined — skip validation

        const errors: string[] = [];

        // Check required fields
        const required = schema.required;
        if (Array.isArray(required)) {
            for (const field of required) {
                if (typeof field === "string" && (variables[field] === undefined || variables[field] === null)) {
                    errors.push(`Missing required variable: "${field}"`);
                }
            }
        }

        // Check basic type constraints from properties
        const properties = schema.properties;
        if (properties && typeof properties === "object") {
            for (const [key, def] of Object.entries(properties as Record<string, any>)) {
                const value = variables[key];
                if (value === undefined || value === null) continue; // already handled by required check
                const expectedType = def?.type;
                if (!expectedType) continue;

                const actualType = Array.isArray(value) ? "array" : typeof value;
                if (expectedType === "number" && actualType !== "number") {
                    errors.push(`Variable "${key}" expected number, got ${actualType}`);
                } else if (expectedType === "string" && actualType !== "string") {
                    errors.push(`Variable "${key}" expected string, got ${actualType}`);
                } else if (expectedType === "boolean" && actualType !== "boolean") {
                    errors.push(`Variable "${key}" expected boolean, got ${actualType}`);
                } else if (expectedType === "array" && actualType !== "array") {
                    errors.push(`Variable "${key}" expected array, got ${actualType}`);
                } else if (expectedType === "object" && actualType !== "object") {
                    errors.push(`Variable "${key}" expected object, got ${actualType}`);
                }
            }
        }

        if (errors.length > 0) {
            const message = `Template variable validation failed (tpl=${templateVersion.templateId} v${templateVersion.version}): ${errors.join("; ")}`;
            this.logger.warn({ errors, templateId: templateVersion.templateId }, "[doc:composer] " + message);
            throw new Error(message);
        }
    }

    private registerHelpers(): void {
        // Date formatting helper — locale-aware
        Handlebars.registerHelper("formatDate", (date: unknown, ...args: unknown[]) => {
            if (!date) return "";
            const d = new Date(date as string);
            if (isNaN(d.getTime())) return String(date);
            // Last arg is Handlebars options hash — check for locale in hash or use "en-US"
            const opts = args[args.length - 1] as any;
            const locale = opts?.hash?.locale ?? "en-US";
            return d.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
        });

        // Number formatting helper — locale-aware
        Handlebars.registerHelper("formatNumber", (num: unknown, ...args: unknown[]) => {
            if (num === null || num === undefined) return "";
            const n = Number(num);
            if (isNaN(n)) return String(num);
            const opts = args[args.length - 1] as any;
            const decimals = typeof args[0] === "number" ? args[0] : 2;
            const locale = opts?.hash?.locale ?? "en-US";
            return n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        });

        // Currency formatting helper — locale-aware
        Handlebars.registerHelper("formatCurrency", (amount: unknown, ...args: unknown[]) => {
            if (amount === null || amount === undefined) return "";
            const n = Number(amount);
            if (isNaN(n)) return String(amount);
            const opts = args[args.length - 1] as any;
            const currency = typeof args[0] === "string" ? args[0] : (opts?.hash?.currency ?? "USD");
            const locale = opts?.hash?.locale ?? "en-US";
            return n.toLocaleString(locale, {
                style: "currency",
                currency,
            });
        });

        // Conditional equality helper
        Handlebars.registerHelper("eq", (a: unknown, b: unknown) => a === b);

        // Uppercase helper
        Handlebars.registerHelper("upper", (str: unknown) =>
            typeof str === "string" ? str.toUpperCase() : str,
        );
    }
}
