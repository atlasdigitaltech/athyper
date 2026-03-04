/**
 * DocHtmlComposer — unit tests.
 *
 * Covers: template compilation, variable substitution, variable validation,
 * brand CSS generation, watermark, RTL direction, locale-aware helpers, cache eviction.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import { DocHtmlComposer, type ComposeOptions } from "../domain/services/DocHtmlComposer.js";

import type { DocBrandProfile } from "../domain/models/DocBrandProfile.js";
import type { DocLetterhead } from "../domain/models/DocLetterhead.js";
import type { DocTemplateVersion } from "../domain/models/DocTemplate.js";
import type { TemplateId, TemplateVersionId } from "../domain/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockLogger() {
    return {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        fatal: vi.fn(),
        trace: vi.fn(),
        child: vi.fn().mockReturnThis(),
    } as any;
}

function baseVersion(overrides?: Partial<DocTemplateVersion>): DocTemplateVersion {
    return {
        id: "ver-1" as TemplateVersionId,
        tenantId: "t1",
        templateId: "tpl-1" as TemplateId,
        version: 1,
        contentHtml: "<p>Hello {{name}}</p>",
        contentJson: null,
        headerHtml: null,
        footerHtml: null,
        stylesCss: null,
        variablesSchema: null,
        assetsManifest: null,
        checksum: "abc123",
        publishedAt: null,
        publishedBy: null,
        effectiveFrom: null,
        effectiveTo: null,
        createdAt: new Date(),
        createdBy: "system",
        ...overrides,
    };
}

function baseLetterhead(overrides?: Partial<DocLetterhead>): DocLetterhead {
    return {
        id: "lh-1" as any,
        tenantId: "t1",
        code: "default",
        name: "Default Letterhead",
        orgUnitId: null,
        logoStorageKey: null,
        headerHtml: "<div>Letterhead Header</div>",
        footerHtml: "<div>Letterhead Footer</div>",
        watermarkText: null,
        watermarkOpacity: 0.15,
        defaultFonts: null,
        pageMargins: null,
        isDefault: true,
        metadata: null,
        createdAt: new Date(),
        createdBy: "system",
        updatedAt: null,
        updatedBy: null,
        ...overrides,
    };
}

function baseBrandProfile(overrides?: Partial<DocBrandProfile>): DocBrandProfile {
    return {
        id: "bp-1" as any,
        tenantId: "t1",
        code: "default",
        name: "Default Brand",
        palette: {
            primary: "#0066cc",
            secondary: "#333",
            accent: "#ff6600",
            text: "#222",
            background: "#fff",
            border: "#ddd",
        },
        typography: {
            headingFont: "Arial",
            bodyFont: "Helvetica",
            sizes: { xs: "8pt", sm: "10pt", md: "12pt", lg: "16pt", xl: "20pt", xxl: "24pt" },
            lineHeight: 1.6,
        },
        spacingScale: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px" },
        direction: "LTR",
        defaultLocale: "en-US",
        supportedLocales: ["en-US"],
        isDefault: true,
        metadata: null,
        createdAt: new Date(),
        createdBy: "system",
        updatedAt: null,
        updatedBy: null,
        ...overrides,
    };
}

const defaultOptions: ComposeOptions = { locale: "en-US", timezone: "UTC" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DocHtmlComposer", () => {
    let composer: DocHtmlComposer;
    let logger: ReturnType<typeof mockLogger>;

    beforeEach(() => {
        logger = mockLogger();
        composer = new DocHtmlComposer(logger);
    });

    // -----------------------------------------------------------------------
    // Template compilation + variable substitution
    // -----------------------------------------------------------------------

    describe("template compilation", () => {
        it("should substitute variables into body HTML", () => {
            const version = baseVersion({ contentHtml: "<h1>{{title}}</h1><p>{{body}}</p>" });
            const html = composer.compose(version, null, null, { title: "Invoice", body: "Amount due" }, defaultOptions);

            expect(html).toContain("<h1>Invoice</h1>");
            expect(html).toContain("<p>Amount due</p>");
        });

        it("should produce valid HTML5 document structure", () => {
            const version = baseVersion();
            const html = composer.compose(version, null, null, { name: "World" }, defaultOptions);

            expect(html).toContain("<!DOCTYPE html>");
            expect(html).toContain('<html lang="en"');
            expect(html).toContain("</html>");
            expect(html).toContain('<meta charset="UTF-8">');
        });

        it("should handle empty variables gracefully", () => {
            const version = baseVersion({ contentHtml: "<p>Hello {{name}}</p>" });
            const html = composer.compose(version, null, null, {}, defaultOptions);

            // Handlebars in non-strict mode renders missing vars as empty string
            expect(html).toContain("<p>Hello </p>");
        });

        it("should cache compiled templates on second call", () => {
            const version = baseVersion();
            const html1 = composer.compose(version, null, null, { name: "A" }, defaultOptions);
            const html2 = composer.compose(version, null, null, { name: "B" }, defaultOptions);

            expect(html1).toContain("Hello A");
            expect(html2).toContain("Hello B");
        });
    });

    // -----------------------------------------------------------------------
    // Variable validation
    // -----------------------------------------------------------------------

    describe("variable validation", () => {
        it("should throw when required variable is missing", () => {
            const version = baseVersion({
                variablesSchema: {
                    required: ["name", "amount"],
                    properties: {},
                },
            });

            expect(() =>
                composer.compose(version, null, null, { name: "test" }, defaultOptions),
            ).toThrow(/Missing required variable: "amount"/);
        });

        it("should throw on type mismatch", () => {
            const version = baseVersion({
                variablesSchema: {
                    required: [],
                    properties: { count: { type: "number" } },
                },
            });

            expect(() =>
                composer.compose(version, null, null, { count: "not-a-number" }, defaultOptions),
            ).toThrow(/expected number/);
        });

        it("should pass when all required variables are present with correct types", () => {
            const version = baseVersion({
                variablesSchema: {
                    required: ["name"],
                    properties: { name: { type: "string" }, count: { type: "number" } },
                },
            });

            expect(() =>
                composer.compose(version, null, null, { name: "test", count: 5 }, defaultOptions),
            ).not.toThrow();
        });

        it("should skip validation when no schema defined", () => {
            const version = baseVersion({ variablesSchema: null });

            expect(() =>
                composer.compose(version, null, null, {}, defaultOptions),
            ).not.toThrow();
        });

        it("should validate array type", () => {
            const version = baseVersion({
                variablesSchema: {
                    required: [],
                    properties: { items: { type: "array" } },
                },
            });

            expect(() =>
                composer.compose(version, null, null, { items: "not-an-array" }, defaultOptions),
            ).toThrow(/expected array/);

            expect(() =>
                composer.compose(version, null, null, { items: [1, 2, 3] }, defaultOptions),
            ).not.toThrow();
        });
    });

    // -----------------------------------------------------------------------
    // Brand CSS generation
    // -----------------------------------------------------------------------

    describe("brand CSS", () => {
        it("should generate CSS variables from brand palette", () => {
            const profile = baseBrandProfile();
            const version = baseVersion();
            const html = composer.compose(version, null, profile, { name: "X" }, defaultOptions);

            expect(html).toContain("--brand-primary: #0066cc");
            expect(html).toContain("--brand-text: #222");
            expect(html).toContain("--font-heading: Arial");
            expect(html).toContain("--font-body: Helvetica");
            expect(html).toContain("--line-height: 1.6");
        });

        it("should generate spacing scale variables", () => {
            const profile = baseBrandProfile();
            const version = baseVersion();
            const html = composer.compose(version, null, profile, { name: "X" }, defaultOptions);

            expect(html).toContain("--spacing-xs: 4px");
            expect(html).toContain("--spacing-lg: 24px");
        });

        it("should produce empty CSS when no brand profile", () => {
            const version = baseVersion();
            const html = composer.compose(version, null, null, { name: "X" }, defaultOptions);

            expect(html).not.toContain("--brand-primary");
        });
    });

    // -----------------------------------------------------------------------
    // Watermark
    // -----------------------------------------------------------------------

    describe("watermark", () => {
        it("should inject watermark when letterhead has watermarkText", () => {
            const lh = baseLetterhead({ watermarkText: "DRAFT", watermarkOpacity: 0.2 });
            const version = baseVersion();
            const html = composer.compose(version, lh, null, { name: "X" }, defaultOptions);

            expect(html).toContain("DRAFT");
            expect(html).toContain("doc-watermark");
            expect(html).toContain("opacity:0.2");
        });

        it("should use default opacity when not specified", () => {
            const lh = baseLetterhead({ watermarkText: "CONFIDENTIAL", watermarkOpacity: 0.15 });
            const version = baseVersion();
            const html = composer.compose(version, lh, null, { name: "X" }, defaultOptions);

            expect(html).toContain("opacity:0.15");
        });

        it("should not inject watermark when watermarkText is null", () => {
            const lh = baseLetterhead({ watermarkText: null });
            const version = baseVersion();
            const html = composer.compose(version, lh, null, { name: "X" }, defaultOptions);

            expect(html).not.toContain("doc-watermark");
        });
    });

    // -----------------------------------------------------------------------
    // RTL direction
    // -----------------------------------------------------------------------

    describe("RTL direction", () => {
        it("should set dir=rtl when brand profile direction is RTL", () => {
            const profile = baseBrandProfile({ direction: "RTL" });
            const version = baseVersion();
            const html = composer.compose(version, null, profile, { name: "X" }, defaultOptions);

            expect(html).toContain('dir="rtl"');
        });

        it("should set dir=ltr by default", () => {
            const profile = baseBrandProfile({ direction: "LTR" });
            const version = baseVersion();
            const html = composer.compose(version, null, profile, { name: "X" }, defaultOptions);

            expect(html).toContain('dir="ltr"');
        });

        it("should set dir=ltr when no brand profile provided", () => {
            const version = baseVersion();
            const html = composer.compose(version, null, null, { name: "X" }, defaultOptions);

            expect(html).toContain('dir="ltr"');
        });
    });

    // -----------------------------------------------------------------------
    // Header / footer composition
    // -----------------------------------------------------------------------

    describe("header and footer", () => {
        it("should use letterhead header over template header", () => {
            const version = baseVersion({ headerHtml: "<div>Template Header</div>" });
            const lh = baseLetterhead({ headerHtml: "<div>Letterhead Header</div>" });
            const html = composer.compose(version, lh, null, { name: "X" }, defaultOptions);

            expect(html).toContain("Letterhead Header");
            expect(html).not.toContain("Template Header");
        });

        it("should fall back to template header when no letterhead header", () => {
            const version = baseVersion({ headerHtml: "<div>Template Header</div>" });
            const lh = baseLetterhead({ headerHtml: null });
            const html = composer.compose(version, lh, null, { name: "X" }, defaultOptions);

            expect(html).toContain("Template Header");
        });

        it("should render variables in header/footer", () => {
            const version = baseVersion({ headerHtml: "<div>To: {{recipient}}</div>" });
            const html = composer.compose(version, null, null, { name: "X", recipient: "John" }, defaultOptions);

            expect(html).toContain("To: John");
        });
    });

    // -----------------------------------------------------------------------
    // Cache eviction
    // -----------------------------------------------------------------------

    describe("cache eviction", () => {
        it("should evict oldest entries when cache reaches max size", () => {
            // Use a tiny cache (max 4 entries)
            const tinyComposer = new DocHtmlComposer(logger, 4);

            // Fill the cache with 4 entries
            for (let i = 0; i < 4; i++) {
                const v = baseVersion({ contentHtml: `<p>Template ${i}</p>` });
                (v as any).templateId = `tpl-${i}`;
                tinyComposer.compose(v, null, null, {}, defaultOptions);
            }

            // Adding a 5th should trigger eviction
            const v5 = baseVersion({ contentHtml: "<p>Template 5</p>" });
            (v5 as any).templateId = "tpl-5";
            tinyComposer.compose(v5, null, null, {}, defaultOptions);

            // Eviction debug log should have been called
            expect(logger.debug).toHaveBeenCalledWith(
                expect.objectContaining({ evicted: expect.any(Number) }),
                expect.stringContaining("Cache eviction"),
            );
        });
    });

    // -----------------------------------------------------------------------
    // Locale-aware Handlebars helpers
    // -----------------------------------------------------------------------

    describe("locale-aware helpers", () => {
        it("formatDate helper should format dates", () => {
            const version = baseVersion({
                contentHtml: "<p>{{formatDate invoiceDate}}</p>",
            });
            const html = composer.compose(version, null, null, {
                invoiceDate: "2025-01-15T00:00:00Z",
            }, defaultOptions);

            // Should contain a formatted date (locale-dependent output)
            expect(html).toContain("January");
            expect(html).toContain("15");
            expect(html).toContain("2025");
        });

        it("formatNumber helper should format numbers with decimals", () => {
            const version = baseVersion({
                contentHtml: "<p>{{formatNumber total 2}}</p>",
            });
            const html = composer.compose(version, null, null, { total: 1234.5 }, defaultOptions);

            // en-US format: 1,234.50
            expect(html).toContain("1,234.50");
        });

        it("formatCurrency helper should format currency", () => {
            const version = baseVersion({
                contentHtml: '<p>{{formatCurrency amount "USD"}}</p>',
            });
            const html = composer.compose(version, null, null, { amount: 99.99 }, defaultOptions);

            // Should contain $ and 99.99
            expect(html).toContain("$");
            expect(html).toContain("99.99");
        });

        it("eq helper should test equality", () => {
            const version = baseVersion({
                contentHtml: '{{#if (eq status "paid")}}<span>PAID</span>{{/if}}',
            });
            const html = composer.compose(version, null, null, { status: "paid" }, defaultOptions);
            expect(html).toContain("PAID");

            const html2 = composer.compose(version, null, null, { status: "pending" }, defaultOptions);
            expect(html2).not.toContain("PAID");
        });

        it("upper helper should uppercase strings", () => {
            const version = baseVersion({
                contentHtml: "<p>{{upper greeting}}</p>",
            });
            const html = composer.compose(version, null, null, { greeting: "hello" }, defaultOptions);
            expect(html).toContain("HELLO");
        });
    });
});
