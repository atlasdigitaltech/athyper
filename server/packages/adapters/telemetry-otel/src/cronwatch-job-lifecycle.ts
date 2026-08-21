import type { JobExecutionLifecycle } from "@athyper/server-contract-jobs";

export interface CronwatchJobLifecycleOptions {
  readonly baseUrl?: string;
  readonly pingKey?: string;
  readonly delegate?: JobExecutionLifecycle;
  readonly timeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
  readonly warn?: (message: string) => void;
}

export function createCronwatchJobLifecycle(
  options: CronwatchJobLifecycleOptions,
): JobExecutionLifecycle {
  const baseUrl = buildPingBaseUrl(options.baseUrl, options.pingKey);
  const request = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;
  let lastWarningAt = 0;

  const ping = async (path: string, body?: string) => {
    if (!baseUrl) return;
    try {
      const response = await request(`${baseUrl}/${path}`, {
        method: body === undefined ? "GET" : "POST",
        ...(body === undefined ? {} : { body: body.slice(0, 1_000) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`Cronwatch returned HTTP ${response.status}`);
    } catch (error) {
      const now = Date.now();
      if (now - lastWarningAt >= 60_000) {
        lastWarningAt = now;
        options.warn?.(error instanceof Error ? error.message : String(error));
      }
    }
  };

  return {
    async enqueued(input) {
      return options.delegate?.enqueued(input);
    },
    async started(job) {
      await options.delegate?.started(job);
      void ping(`${slug(job.queue, job.name)}/start`);
    },
    async completed(job, result) {
      await options.delegate?.completed(job, result);
      void ping(slug(job.queue, job.name));
    },
    async failed(job, failure) {
      await options.delegate?.failed(job, failure);
      void ping(`${slug(job.queue, job.name)}/fail`, `${failure.code}: ${failure.message}`);
    },
  };
}

function buildPingBaseUrl(baseUrl: string | undefined, pingKey: string | undefined): string | undefined {
  const normalizedBase = baseUrl?.trim().replace(/\/+$/, "");
  if (!normalizedBase) return undefined;
  const normalizedKey = pingKey?.trim().replace(/^\/+|\/+$/g, "");
  return normalizedKey ? `${normalizedBase}/${encodeURIComponent(normalizedKey)}` : normalizedBase;
}

function slug(queue: string, name: string): string {
  return `${queue}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
