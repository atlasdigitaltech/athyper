/**
 * PdfRendererAdapter — Interface + Puppeteer implementation.
 *
 * Uses puppeteer-core with a reusable browser instance for HTML→PDF rendering.
 * Includes: render timeout, concurrent page semaphore, browser reconnection.
 */

import type { PdfRenderOptions } from "../domain/types.js";

// ============================================================================
// Interface
// ============================================================================

export interface PdfRendererAdapter {
    renderHtmlToPdf(html: string, options?: PdfRenderOptions): Promise<Buffer>;
    healthCheck(): Promise<{ healthy: boolean; message?: string }>;
    close(): Promise<void>;
}

// ============================================================================
// Semaphore — limits concurrent Puppeteer pages
// ============================================================================

class Semaphore {
    private queue: Array<() => void> = [];
    private active = 0;

    constructor(private readonly maxConcurrent: number) {}

    async acquire(): Promise<void> {
        if (this.active < this.maxConcurrent) {
            this.active++;
            return;
        }
        return new Promise<void>((resolve) => {
            this.queue.push(resolve);
        });
    }

    release(): void {
        this.active--;
        const next = this.queue.shift();
        if (next) {
            this.active++;
            next();
        }
    }

    get pending(): number {
        return this.queue.length;
    }

    get currentActive(): number {
        return this.active;
    }
}

// ============================================================================
// Puppeteer Implementation
// ============================================================================

export interface PuppeteerRendererConfig {
    chromiumPath?: string;
    timeoutMs: number;
    maxConcurrentPages?: number;
    /** Trusted domains for network requests during rendering (e.g., fonts CDN). Empty = block all. */
    trustedDomains?: string[];
    /** Allowed external hosts for URL-fetching during template resolution. Empty = no restriction. */
    allowedHosts?: string[];
}

export class PuppeteerPdfRenderer implements PdfRendererAdapter {
    private browser: any = null;
    private launching = false;
    private launchPromise: Promise<any> | null = null;
    private readonly semaphore: Semaphore;

    constructor(private readonly config: PuppeteerRendererConfig) {
        this.semaphore = new Semaphore(config.maxConcurrentPages ?? 5);
    }

    async renderHtmlToPdf(html: string, options?: PdfRenderOptions): Promise<Buffer> {
        await this.semaphore.acquire();

        try {
            return await this.withTimeout(
                this.doRender(html, options),
                this.config.timeoutMs,
                "PDF render timed out",
            );
        } finally {
            this.semaphore.release();
        }
    }

    async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
        try {
            const browser = await this.getBrowser();
            const version = await browser.version();
            return {
                healthy: true,
                message: `Chromium ${version} | pages: ${this.semaphore.currentActive}/${this.config.maxConcurrentPages ?? 5} | queued: ${this.semaphore.pending}`,
            };
        } catch (error) {
            return { healthy: false, message: String(error) };
        }
    }

    async close(): Promise<void> {
        if (this.browser) {
            try {
                await this.browser.close();
            } catch {
                // browser may already be disconnected
            }
            this.browser = null;
        }
    }

    private async doRender(html: string, options?: PdfRenderOptions): Promise<Buffer> {
        const browser = await this.getBrowser();
        const page = await browser.newPage();

        try {
            // SSRF protection — block network requests except trusted domains and data: URIs
            await page.setRequestInterception(true);
            const trustedDomains = this.config.trustedDomains ?? [];

            page.on("request", (request: any) => {
                const url: string = request.url();

                // Always allow data: and blob: URIs (inline images, fonts)
                if (url.startsWith("data:") || url.startsWith("blob:")) {
                    request.continue();
                    return;
                }

                // Check against trusted domains
                if (trustedDomains.length > 0) {
                    try {
                        const parsed = new URL(url);
                        if (trustedDomains.some(d => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`))) {
                            request.continue();
                            return;
                        }
                    } catch {
                        // Invalid URL — block
                    }
                }

                // Block all other network requests
                request.abort("blockedbyclient");
            });

            await page.setContent(html, { waitUntil: "networkidle0", timeout: this.config.timeoutMs });

            const pdfOptions: Record<string, unknown> = {
                format: options?.format ?? "A4",
                landscape: options?.landscape ?? false,
                printBackground: options?.printBackground ?? true,
                preferCSSPageSize: options?.preferCSSPageSize ?? false,
            };

            if (options?.margins) {
                pdfOptions.margin = {
                    top: options.margins.top,
                    right: options.margins.right,
                    bottom: options.margins.bottom,
                    left: options.margins.left,
                };
            }

            if (options?.displayHeaderFooter) {
                pdfOptions.displayHeaderFooter = true;
                if (options.headerTemplate) pdfOptions.headerTemplate = options.headerTemplate;
                if (options.footerTemplate) pdfOptions.footerTemplate = options.footerTemplate;
            }

            const pdfBuffer = await page.pdf(pdfOptions);
            return Buffer.from(pdfBuffer);
        } finally {
            await page.close().catch(() => {});
        }
    }

    private async getBrowser(): Promise<any> {
        // Verify existing browser is still connected
        if (this.browser) {
            try {
                await this.browser.version();
                return this.browser;
            } catch {
                // Browser disconnected — clear and relaunch
                this.browser = null;
            }
        }

        // Prevent concurrent launches
        if (this.launching && this.launchPromise) {
            return this.launchPromise;
        }

        this.launching = true;
        this.launchPromise = this.launchBrowser();

        try {
            this.browser = await this.launchPromise;
            return this.browser;
        } finally {
            this.launching = false;
            this.launchPromise = null;
        }
    }

    private async launchBrowser(): Promise<any> {
        // Dynamic import to avoid requiring puppeteer-core at module load time
        const puppeteer = await import("puppeteer-core");

        const launchOptions: Record<string, unknown> = {
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--font-render-hinting=none",
            ],
        };

        if (this.config.chromiumPath) {
            launchOptions.executablePath = this.config.chromiumPath;
        }

        const browser = await puppeteer.default.launch(launchOptions);

        // Handle unexpected browser disconnection
        browser.on("disconnected", () => {
            this.browser = null;
        });

        return browser;
    }

    /** Race a promise against a timeout. */
    private async withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
        let timer: ReturnType<typeof setTimeout>;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${message} (${ms}ms)`)), ms);
        });
        try {
            return await Promise.race([promise, timeout]);
        } finally {
            clearTimeout(timer!);
        }
    }
}
