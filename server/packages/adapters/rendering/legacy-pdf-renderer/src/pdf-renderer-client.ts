/**
 * PdfRendererClient — legacy athyper-renderer container HTTP client.
 * Implements SyncPdfRenderer from @athyper/platform-rendering.
 * New deployments should prefer @athyper/adapter-rendering-gotenberg.
 */

import type { PdfRenderOptions, SyncPdfRenderer, RenderJobStatus, RendererHealth } from "@athyper/platform-rendering";

export class PdfRendererClient implements SyncPdfRenderer {
  private readonly baseUrl:       string;
  private readonly internalToken: string;
  private readonly timeoutMs:     number;
  private readonly logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };

  constructor(config: {
    baseUrl:       string;
    internalToken: string;
    timeoutMs?:    number;
    logger?:       { error(event: string, fields?: Record<string, unknown>): void; warn(event: string, fields?: Record<string, unknown>): void };
  }) {
    this.baseUrl       = config.baseUrl.replace(/\/$/, "");
    this.internalToken = config.internalToken;
    this.timeoutMs     = config.timeoutMs ?? 30_000;
    this.logger        = config.logger;
  }

  async renderSync(html: string, options?: PdfRenderOptions): Promise<Buffer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Renderer-Token": this.internalToken },
        body:   JSON.stringify({ html, options: options ?? {} }),
        signal: controller.signal,
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

  async renderAsync(html: string, options?: PdfRenderOptions, jobId?: string): Promise<string> {
    const id = jobId ?? crypto.randomUUID();
    const response = await fetch(`${this.baseUrl}/render-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Renderer-Token": this.internalToken },
      body: JSON.stringify({ html, options: options ?? {}, jobId: id }),
    });

    if (response.status !== 202) {
      const err = await response.text().catch(() => "unknown");
      throw new Error(`Renderer job submission failed ${response.status}: ${err}`);
    }

    const body = await response.json() as { jobId?: string };
    return body.jobId ?? id;
  }

  async getJobStatus(jobId: string): Promise<RenderJobStatus> {
    const response = await fetch(`${this.baseUrl}/render-jobs/${encodeURIComponent(jobId)}`, {
      headers: { "X-Renderer-Token": this.internalToken },
    });

    if (response.status === 404) {
      return { jobId, status: "failed", downloadUrl: null, error: "Job not found" };
    }
    if (!response.ok) throw new Error(`Renderer job status check failed: ${response.status}`);

    const body = await response.json() as Partial<RenderJobStatus>;
    return { jobId, status: body.status ?? "pending", downloadUrl: body.downloadUrl ?? null, error: body.error ?? null };
  }

  async health(): Promise<RendererHealth> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, { headers: { "X-Renderer-Token": this.internalToken } });
      if (!response.ok) return { healthy: false, browserPool: null };
      const body = await response.json() as Partial<RendererHealth>;
      return { healthy: body.healthy ?? false, browserPool: body.browserPool ?? null };
    } catch {
      return { healthy: false, browserPool: null };
    }
  }

  async isAvailable(): Promise<boolean> {
    return (await this.health()).healthy;
  }
}

export function createPdfRendererClient(config?: {
  baseUrl?:       string;
  internalToken?: string;
  timeoutMs?:     number;
  logger?:        { error(event: string, fields?: Record<string, unknown>): void; warn(event: string, fields?: Record<string, unknown>): void };
}): PdfRendererClient | null {
  const baseUrl       = config?.baseUrl       ?? process.env["RENDERER_BASE_URL"]       ?? "";
  const internalToken = config?.internalToken ?? process.env["RENDERER_INTERNAL_TOKEN"] ?? "";
  if (!baseUrl || !internalToken) return null;
  return new PdfRendererClient({ baseUrl, internalToken, timeoutMs: config?.timeoutMs, logger: config?.logger });
}
