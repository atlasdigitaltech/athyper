/**
 * PdfRendererClient — Phase 5.1
 *
 * HTTP client for the athyper-renderer container.
 * Communicates with the renderer via its REST API.
 *
 * Renderer contract (I3 from PLATFORM_MIGRATION.md §5.1):
 *
 *   POST /render
 *     Body:     { html: string, options: PdfRenderOptions }
 *     Response: application/pdf binary (synchronous)
 *     Use for: template rendering, report packs, documents < 5MB HTML
 *     Timeout:  30s (configurable)
 *
 *   POST /render-jobs
 *     Body:     { html: string, options: PdfRenderOptions, jobId: string }
 *     Response: 202 { jobId }
 *     Use for: large documents, batch rendering
 *
 *   GET /render-jobs/:jobId
 *     Response: { status: 'pending'|'processing'|'completed'|'failed', downloadUrl? }
 *
 *   GET /health
 *     Response: { healthy: boolean, browserPool: { active, idle, waiting } }
 *
 * Authentication: X-Renderer-Token header (RENDERER_INTERNAL_TOKEN env var).
 * Not a tenant JWT — platform service call.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PdfRenderOptions {
  /** Paper format. Default: A4 */
  format?:        "A4" | "A3" | "Letter" | "Legal";
  /** Print background graphics. Default: true */
  printBackground?: boolean;
  /** Page margin overrides */
  margin?:        { top?: string; bottom?: string; left?: string; right?: string };
  /** Display header template (HTML string) */
  headerTemplate?: string;
  /** Display footer template (HTML string) */
  footerTemplate?: string;
  /** Display header and footer. Default: false */
  displayHeaderFooter?: boolean;
  /** Scale (0.1–2). Default: 1 */
  scale?:         number;
  /** Landscape mode. Default: false */
  landscape?:     boolean;
}

export interface RenderJobStatus {
  jobId:       string;
  status:      "pending" | "processing" | "completed" | "failed";
  downloadUrl: string | null;
  error:       string | null;
}

export interface RendererHealth {
  healthy:     boolean;
  browserPool: { active: number; idle: number; waiting: number } | null;
}

/**
 * Structural interface used by RenderService — the only two calls the
 * service makes. Implemented by PdfRendererClient and GotenbergClient so
 * either can be injected.
 */
export interface SyncPdfRenderer {
  renderSync(html: string, options?: PdfRenderOptions): Promise<Buffer>;
  isAvailable(): Promise<boolean>;
}

// ── PdfRendererClient ─────────────────────────────────────────────────────────

export class PdfRendererClient implements SyncPdfRenderer {
  private readonly baseUrl:      string;
  private readonly internalToken: string;
  private readonly timeoutMs:    number;
  private readonly logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };

  constructor(config: {
    baseUrl:        string;
    internalToken:  string;
    timeoutMs?:     number;
    logger?:        { error(event: string, fields?: Record<string, unknown>): void; warn(event: string, fields?: Record<string, unknown>): void };
  }) {
    this.baseUrl       = config.baseUrl.replace(/\/$/, "");
    this.internalToken = config.internalToken;
    this.timeoutMs     = config.timeoutMs ?? 30_000;
    this.logger        = config.logger;
  }

  /**
   * Synchronous render — returns PDF as Buffer.
   * Use for small-to-medium documents (< 5MB HTML source).
   * Times out after timeoutMs (default 30s).
   */
  async renderSync(html: string, options?: PdfRenderOptions): Promise<Buffer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/render`, {
        method:  "POST",
        headers: {
          "Content-Type":      "application/json",
          "X-Renderer-Token":  this.internalToken,
        },
        body:    JSON.stringify({ html, options: options ?? {} }),
        signal:  controller.signal,
      });

      if (!response.ok) {
        const err = await response.text().catch(() => "unknown error");
        throw new Error(`Renderer returned ${response.status}: ${err}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new Error(`Renderer timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Async render job — returns jobId immediately (202 Accepted).
   * Use for large documents or batch rendering.
   * Poll getJobStatus() until status = 'completed' | 'failed'.
   */
  async renderAsync(html: string, options?: PdfRenderOptions, jobId?: string): Promise<string> {
    const id = jobId ?? crypto.randomUUID();
    const response = await fetch(`${this.baseUrl}/render-jobs`, {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "X-Renderer-Token":  this.internalToken,
      },
      body: JSON.stringify({ html, options: options ?? {}, jobId: id }),
    });

    if (response.status !== 202) {
      const err = await response.text().catch(() => "unknown");
      throw new Error(`Renderer job submission failed ${response.status}: ${err}`);
    }

    const body = await response.json() as { jobId?: string };
    return body.jobId ?? id;
  }

  /**
   * Poll the status of an async render job.
   */
  async getJobStatus(jobId: string): Promise<RenderJobStatus> {
    const response = await fetch(`${this.baseUrl}/render-jobs/${encodeURIComponent(jobId)}`, {
      headers: {
        "X-Renderer-Token": this.internalToken,
      },
    });

    if (response.status === 404) {
      return { jobId, status: "failed", downloadUrl: null, error: "Job not found" };
    }

    if (!response.ok) {
      throw new Error(`Renderer job status check failed: ${response.status}`);
    }

    const body = await response.json() as Partial<RenderJobStatus>;
    return {
      jobId,
      status:      body.status ?? "pending",
      downloadUrl: body.downloadUrl ?? null,
      error:       body.error ?? null,
    };
  }

  /**
   * Check renderer health.
   */
  async health(): Promise<RendererHealth> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        headers: { "X-Renderer-Token": this.internalToken },
      });

      if (!response.ok) {
        return { healthy: false, browserPool: null };
      }

      const body = await response.json() as Partial<RendererHealth>;
      return {
        healthy:     body.healthy ?? false,
        browserPool: body.browserPool ?? null,
      };
    } catch {
      return { healthy: false, browserPool: null };
    }
  }

  /**
   * Check if the renderer is available (for startup / health contribution).
   */
  async isAvailable(): Promise<boolean> {
    const h = await this.health();
    return h.healthy;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createPdfRendererClient(config?: {
  baseUrl?:        string;
  internalToken?:  string;
  timeoutMs?:      number;
  logger?:         { error(event: string, fields?: Record<string, unknown>): void; warn(event: string, fields?: Record<string, unknown>): void };
}): PdfRendererClient | null {
  const baseUrl       = config?.baseUrl       ?? process.env["RENDERER_BASE_URL"] ?? "";
  const internalToken = config?.internalToken ?? process.env["RENDERER_INTERNAL_TOKEN"] ?? "";

  if (!baseUrl || !internalToken) {
    return null;
  }

  return new PdfRendererClient({ baseUrl, internalToken, timeoutMs: config?.timeoutMs, logger: config?.logger });
}
