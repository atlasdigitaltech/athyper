import { localPromptTokenBound } from "@athyper/server-contract-ai";
import type {
  AtlasModelProvider,
  AtlasProviderEvent,
  AtlasProviderInvocation,
  AtlasProviderErrorClass,
} from "@athyper/server-contract-ai";

export const OLLAMA_ADAPTER_ID = "ollama-native";
export const OLLAMA_ADAPTER_VERSION = "1";
const ENDPOINT = "http://atlas-inference:11434";
export class LocalError extends Error {
  constructor(
    readonly classification: AtlasProviderErrorClass,
    readonly code: string,
  ) {
    super(code);
  }
}

/** Single-process admission across all three planes. The local deployment has one
 * API process; replicas require a shared admission implementation before scaling. */
export class LocalInferenceQueue {
  private active = false;
  private readonly waiters: Array<() => void> = [];
  constructor(
    private readonly limit = 8,
    private readonly timeoutMs = 5000,
  ) {
    if (
      !Number.isSafeInteger(limit) ||
      limit < 0 ||
      !Number.isFinite(timeoutMs) ||
      timeoutMs <= 0
    )
      throw new TypeError("Invalid inference queue bounds");
  }
  async acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) throw signal.reason;
    if (this.active) {
      if (this.waiters.length >= this.limit)
        throw new LocalError("overloaded", "local_queue_full");
      await new Promise<void>((resolve, reject) => {
        const clean = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          const i = this.waiters.indexOf(grant);
          if (i >= 0) this.waiters.splice(i, 1);
        };
        const grant = () => {
          clean();
          resolve();
        };
        const abort = () => {
          clean();
          reject(signal.reason);
        };
        const timer = setTimeout(() => {
          clean();
          reject(new LocalError("overloaded", "local_queue_timeout"));
        }, this.timeoutMs);
        this.waiters.push(grant);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
    } else this.active = true;
    // Slot ownership is transferred directly, preventing arrivals overtaking waiters.
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (next) next();
      else this.active = false;
    };
  }
}
/** One shared budget for every Atlas inference client in the supported single API process. */
export interface InferenceAdmission {
  acquire(
    signal: AbortSignal,
    onLost?: (error: Error) => void,
  ): Promise<() => void | Promise<void>>;
}
export let sharedAtlasInferenceQueue: InferenceAdmission =
  new LocalInferenceQueue();
export function configureSharedAtlasInferenceAdmission(
  queue: InferenceAdmission,
): void {
  sharedAtlasInferenceQueue = queue;
}
export interface InferenceDiagnostic {
  readonly workload: "generation" | "embedding";
  readonly phase: string;
  readonly model: string;
  readonly modelDigest: string;
  readonly runId?: string;
  readonly providerCallId?: string;
  readonly operationId?: string;
  readonly attempt: number;
  readonly queueWaitMs: number;
  readonly loadDurationMs: number | null;
  readonly elapsedMs: number;
  readonly code?: string;
}
export function recordInferenceDiagnostic(value: InferenceDiagnostic): void {
  console.info(
    JSON.stringify({ event: "atlas.inference.diagnostic", ...value }),
  );
}
export interface OllamaAdapterOptions {
  readonly modelDigest: string;
  readonly engineVersion: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly queue?: InferenceAdmission;
  readonly readinessTimeoutMs?: number;
  readonly readinessPollMs?: number;
  readonly observe?: (event: InferenceDiagnostic) => void;
}
export class OllamaModelProvider implements AtlasModelProvider {
  readonly providerId = "ollama" as const;
  readonly adapterId = OLLAMA_ADAPTER_ID;
  readonly adapterVersion = OLLAMA_ADAPTER_VERSION;
  private readonly fetcher: typeof fetch;
  private readonly queue: InferenceAdmission;
  constructor(private readonly options: OllamaAdapterOptions) {
    if (
      !/^sha256:[a-f0-9]{64}$/.test(options.modelDigest) ||
      !options.engineVersion.trim()
    )
      throw new TypeError("Pinned Ollama artifact required");
    for (const value of [
      options.timeoutMs,
      options.readinessTimeoutMs,
      options.readinessPollMs,
    ])
      if (value !== undefined && (!Number.isFinite(value) || value <= 0))
        throw new TypeError("Invalid inference time bound");
    this.fetcher = options.fetch ?? fetch;
    this.queue = options.queue ?? sharedAtlasInferenceQueue;
  }
  async *invoke(
    input: AtlasProviderInvocation,
  ): AsyncIterable<AtlasProviderEvent> {
    const started = Date.now();
    let queueWaitMs = 0,
      loadDurationMs = 0,
      attempt = 0,
      waitingSince = 0;
    const diagnostic = (phase: string, code?: string) => {
      const event: InferenceDiagnostic = {
        workload: "generation",
        phase,
        model: input.binding.upstreamModelId,
        modelDigest: this.options.modelDigest,
        runId: input.trace.runId,
        providerCallId: input.trace.providerCallId,
        attempt,
        queueWaitMs,
        loadDurationMs,
        elapsedMs: Date.now() - started,
        ...(code ? { code } : {}),
      };
      try {
        (this.options.observe ?? recordInferenceDiagnostic)(event);
      } catch {
        /* Observation cannot alter dispatch or leak inputs. */
      }
    };
    const reauthorize = async (signal: AbortSignal = controller.signal) => {
      if (!input.reauthorize) return;
      let allowed = false;
      try {
        allowed = await new Promise<boolean>((resolve, reject) => {
          const abort = () => reject(signal.reason);
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) {
            signal.removeEventListener("abort", abort);
            reject(signal.reason);
            return;
          }
          Promise.resolve()
            .then(() => input.reauthorize!())
            .then(resolve, reject)
            .finally(() => signal.removeEventListener("abort", abort));
        });
      } catch {
        if (signal.aborted) throw signal.reason;
        /* Authorization failure denies dispatch without exposing service details. */
      }
      if (!allowed) throw new LocalError("permission", "authorization_changed");
    };
    const controller = new AbortController();
    const abort = () => controller.abort(input.signal?.reason);
    input.signal?.addEventListener("abort", abort, { once: true });
    if (input.signal?.aborted) abort();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.options.timeoutMs ?? 120000);
    let release: (() => void | Promise<void>) | undefined;
    let admissionFailure: Error | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const b = input.binding;
      if (
        b.providerId !== "ollama" ||
        b.adapterId !== this.adapterId ||
        b.adapterVersion !== this.adapterVersion ||
        b.status !== "available" ||
        b.modelDigest !== this.options.modelDigest ||
        b.routingPolicyId !== "no-fallback-v1" ||
        b.fallbackBindingIds?.length ||
        b.credentialPolicy !== "local_transport"
      )
        throw new LocalError("invalid_request", "local_binding_mismatch");
      if (
        input.credential.authMode !== "local_transport" ||
        input.credential.endpoint !== ENDPOINT ||
        input.credential.ownerId !== b.credentialOwnerId
      )
        throw new LocalError("authentication", "local_transport_required");
      if (
        b.capabilities.maxContextTokens !== 4096 ||
        !Number.isSafeInteger(input.prompt.maxOutputTokens) ||
        input.prompt.maxOutputTokens > b.capabilities.maxOutputTokens ||
        Boolean(input.prompt.tools?.length && !b.capabilities.tools) ||
        input.prompt.maxOutputTokens > 1024 ||
        input.prompt.maxOutputTokens < 1 ||
        localPromptTokenBound(input.prompt) + input.prompt.maxOutputTokens >
          4096
      )
        throw new LocalError("invalid_request", "context_budget_exceeded");
      const queued = Date.now();
      waitingSince = queued;
      diagnostic("queued");
      release = await this.queue.acquire(controller.signal, (error) => {
        admissionFailure = error;
        controller.abort(error);
      });
      queueWaitMs = Date.now() - queued;
      waitingSince = 0;
      diagnostic("admitted");
      await reauthorize();
      const request = async (
        path: string,
        body?: unknown,
        signal: AbortSignal = controller.signal,
      ) => {
        const response = await this.fetcher(ENDPOINT + path, {
          signal,
          redirect: "error",
          ...(body
            ? {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
              }
            : {}),
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new LocalError(
            response.status === 429 || response.status === 503
              ? "overloaded"
              : response.status === 404
                ? "model_unavailable"
                : "upstream_error",
            `ollama_http_${response.status}`,
          );
        }
        return response;
      };
      const version = (await (await request("/api/version")).json()) as any;
      const tags = (await (await request("/api/tags")).json()) as any;
      const model = tags.models?.find((m: any) => m.name === b.upstreamModelId);
      if (version.version !== this.options.engineVersion)
        throw new LocalError("model_unavailable", "engine_version_mismatch");
      if (!model)
        throw new LocalError("model_unavailable", "model_not_installed");
      if (
        "sha256:" + String(model.digest).replace(/^sha256:/, "") !==
        b.modelDigest
      )
        throw new LocalError("model_unavailable", "registry_digest_mismatch");
      const readyDeadline =
        Date.now() + (this.options.readinessTimeoutMs ?? 30_000);
      let loads = 0;
      try {
        while (true) {
          attempt++;
          if (Date.now() >= readyDeadline)
            throw new LocalError(
              "model_unavailable",
              "readiness_deadline_exceeded",
            );
          const readySignal = AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(Math.max(1, readyDeadline - Date.now())),
          ]);
          const ps = (await (
            await request("/api/ps", undefined, readySignal)
          ).json()) as any;
          const loaded = ps.models?.find(
            (m: any) => m.name === b.upstreamModelId,
          );
          if (loaded) {
            if (
              "sha256:" + String(loaded.digest).replace(/^sha256:/, "") !==
              b.modelDigest
            )
              throw new LocalError(
                "model_unavailable",
                "loaded_digest_mismatch",
              );
            if (loaded.context_length !== 4096)
              throw new LocalError(
                "model_unavailable",
                "context_length_mismatch",
              );
            if (!(loaded.size > 0))
              throw new LocalError("model_unavailable", "model_size_invalid");
            if (!(loaded.size_vram >= loaded.size))
              throw new LocalError(
                "model_unavailable",
                "gpu_residency_insufficient",
              );
            diagnostic("ready");
            break;
          }
          diagnostic("readiness_wait", "model_not_resident");
          if (Date.now() >= readyDeadline)
            throw new LocalError(
              "model_unavailable",
              "readiness_deadline_exceeded",
            );
          if (loads < 2 && (loads === 0 || input.reauthorize)) {
            await reauthorize(readySignal);
            loads++;
            const loading = Date.now();
            diagnostic("warmup_started");
            // Warm-up contains no prompt. Never retry /api/chat or a stream.
            const warmController = AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(Math.max(1, readyDeadline - Date.now())),
            ]);
            try {
              const warm = await this.fetcher(ENDPOINT + "/api/generate", {
                signal: warmController,
                redirect: "error",
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  model: b.upstreamModelId,
                  keep_alive: "5m",
                  stream: false,
                  options: { num_ctx: 4096 },
                }),
              });
              if (!warm.ok) {
                await warm.body?.cancel();
                throw new LocalError(
                  warm.status === 503 ? "overloaded" : "upstream_error",
                  `warmup_http_${warm.status}`,
                );
              }
              await warm.json();
            } finally {
              loadDurationMs += Date.now() - loading;
            }
            diagnostic("warmup_completed");
          } else {
            await new Promise<void>((resolve, reject) => {
              const abort = () => {
                clearTimeout(timer);
                reject(controller.signal.reason);
              };
              const timer = setTimeout(
                () => {
                  controller.signal.removeEventListener("abort", abort);
                  resolve();
                },
                Math.min(
                  this.options.readinessPollMs ?? 100,
                  Math.max(1, readyDeadline - Date.now()),
                ),
              );
              controller.signal.addEventListener("abort", abort, {
                once: true,
              });
              if (controller.signal.aborted) abort();
            });
          }
        }
      } catch (error) {
        if (Date.now() >= readyDeadline && !controller.signal.aborted)
          throw new LocalError(
            "model_unavailable",
            "readiness_deadline_exceeded",
          );
        throw error;
      }
      await reauthorize();
      diagnostic("chat_dispatch");
      const response = await request("/api/chat", {
        model: b.upstreamModelId,
        stream: true,
        think: false,
        keep_alive: "5m",
        options: { num_ctx: 4096, num_predict: input.prompt.maxOutputTokens },
        messages: input.prompt.messages.flatMap((m) => {
          const text = m.content
            .filter((v) => v.type === "text")
            .map((v) => v.text)
            .join("");
          const calls = m.content
            .filter((v) => v.type === "tool_use")
            .map((v) => ({
              function: { name: v.toolName, arguments: v.input },
            }));
          const results = m.content
            .filter((v) => v.type === "tool_result")
            .map((v) => ({
              role: "tool",
              tool_name: v.toolName,
              content: JSON.stringify(v.result),
            }));
          return [
            ...(text || calls.length
              ? [
                  {
                    role: m.role,
                    content: text,
                    ...(calls.length ? { tool_calls: calls } : {}),
                  },
                ]
              : []),
            ...results,
          ];
        }),
        ...(input.prompt.tools?.length
          ? {
              tools: input.prompt.tools.map((t) => ({
                type: "function",
                function: {
                  name: t.name,
                  description: t.description,
                  parameters: t.inputSchema,
                },
              })),
            }
          : {}),
      });
      if (!response.body)
        throw new LocalError("protocol_error", "missing_stream");
      reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let buffer = "",
        bytes = 0,
        started = false,
        done = false,
        toolIndex = 0,
        hadTools = false;
      while (!done) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value, { stream: !chunk.done });
        bytes += chunk.value?.byteLength ?? 0;
        if (buffer.length > 1048576 || bytes > 4194304)
          throw new LocalError("protocol_error", "stream_too_large");
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        if (chunk.done && buffer.trim()) {
          lines.push(buffer);
          buffer = "";
        }
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as any;
          if (event.error)
            throw new LocalError("upstream_error", "ollama_stream_error");
          if (event.model !== b.upstreamModelId)
            throw new LocalError("protocol_error", "actual_model_mismatch");
          if (!started) {
            started = true;
            yield {
              kind: "response_started",
              providerRequestId: null,
              actualModelId: event.model,
            };
          }
          if (event.message?.thinking)
            throw new LocalError("protocol_error", "unexpected_thinking");
          if (event.message?.content) {
            if (typeof event.message.content !== "string")
              throw new LocalError("protocol_error", "invalid_text");
            yield { kind: "text_delta", text: event.message.content };
          }
          for (const call of event.message?.tool_calls ?? []) {
            const f = call.function;
            if (
              !input.prompt.tools?.some((t) => t.name === f?.name) ||
              !f.arguments ||
              typeof f.arguments !== "object" ||
              Array.isArray(f.arguments)
            )
              throw new LocalError("protocol_error", "invalid_tool_call");
            hadTools = true;
            yield {
              kind: "tool_call_complete",
              callId: `${input.trace.providerCallId}:${toolIndex++}`,
              toolName: f.name,
              input: f.arguments,
            };
          }
          if (event.done === true) {
            for (const n of [
              event.prompt_eval_count,
              event.eval_count,
              event.prompt_eval_cached_count ?? 0,
            ])
              if (!Number.isSafeInteger(n) || n < 0)
                throw new LocalError("protocol_error", "invalid_usage");
            const cached = event.prompt_eval_cached_count ?? 0;
            if (
              cached > event.prompt_eval_count ||
              event.eval_count > input.prompt.maxOutputTokens
            )
              throw new LocalError("protocol_error", "usage_out_of_bounds");
            yield {
              kind: "usage",
              mode: "snapshot",
              final: true,
              usage: {
                inputTokens: event.prompt_eval_count - cached,
                cacheReadTokens: cached,
                outputTokens: event.eval_count,
              },
            };
            if (!["stop", "length"].includes(event.done_reason))
              throw new LocalError("protocol_error", "invalid_finish_reason");
            done = true;
            yield {
              kind: "completed",
              reason: hadTools ? "tool_call" : event.done_reason,
            };
            break;
          }
        }
        if (chunk.done && !done)
          throw new LocalError("stream_incomplete", "stream_incomplete");
      }
      diagnostic("completed");
    } catch (error) {
      if (admissionFailure) error = admissionFailure;
      if (waitingSince) queueWaitMs = Date.now() - waitingSince;
      diagnostic(
        "failed",
        input.signal?.aborted
          ? "cancelled"
          : timedOut
            ? "ollama_timeout"
            : error instanceof LocalError
              ? error.code
              : "ollama_request_failed",
      );
      if (input.signal?.aborted) yield { kind: "cancelled" };
      else
        yield {
          kind: "failed",
          error: {
            errorClass: timedOut
              ? "timeout"
              : error instanceof LocalError
                ? error.classification
                : error instanceof SyntaxError
                  ? "protocol_error"
                  : "upstream_error",
            code: timedOut
              ? "ollama_timeout"
              : error instanceof LocalError
                ? error.code
                : "ollama_request_failed",
            safeMessage: "Local Atlas generation could not be completed.",
            diagnostics: {
              modelDigest: this.options.modelDigest,
              queueWaitMs,
              loadDurationMs,
              readinessChecks: attempt,
            },
            retryable: false,
          },
        };
    } finally {
      controller.abort();
      await reader?.cancel().catch(() => {});
      reader?.releaseLock();
      try {
        await release?.();
        diagnostic("released");
      } catch {
        diagnostic("release_failed", "inference_admission_unavailable");
      }
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", abort);
    }
  }
}
