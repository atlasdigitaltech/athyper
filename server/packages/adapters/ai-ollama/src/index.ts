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
class LocalError extends Error {
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
  ) {}
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
export interface OllamaAdapterOptions {
  readonly modelDigest: string;
  readonly engineVersion: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly queue?: LocalInferenceQueue;
}
export class OllamaModelProvider implements AtlasModelProvider {
  readonly providerId = "ollama" as const;
  readonly adapterId = OLLAMA_ADAPTER_ID;
  readonly adapterVersion = OLLAMA_ADAPTER_VERSION;
  private readonly fetcher: typeof fetch;
  private readonly queue: LocalInferenceQueue;
  constructor(private readonly options: OllamaAdapterOptions) {
    if (
      !/^sha256:[a-f0-9]{64}$/.test(options.modelDigest) ||
      !options.engineVersion.trim()
    )
      throw new TypeError("Pinned Ollama artifact required");
    this.fetcher = options.fetch ?? fetch;
    this.queue = options.queue ?? new LocalInferenceQueue();
  }
  async *invoke(
    input: AtlasProviderInvocation,
  ): AsyncIterable<AtlasProviderEvent> {
    const controller = new AbortController();
    const abort = () => controller.abort(input.signal?.reason);
    input.signal?.addEventListener("abort", abort, { once: true });
    if (input.signal?.aborted) abort();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.options.timeoutMs ?? 120000);
    let release: (() => void) | undefined;
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
      release = await this.queue.acquire(controller.signal);
      const request = async (path: string, body?: unknown) => {
        const response = await this.fetcher(ENDPOINT + path, {
          signal: controller.signal,
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
      if (
        version.version !== this.options.engineVersion ||
        !model ||
        "sha256:" + String(model.digest).replace(/^sha256:/, "") !==
          b.modelDigest
      )
        throw new LocalError("model_unavailable", "artifact_mismatch");
      let ps = (await (await request("/api/ps")).json()) as any;
      if (!ps.models?.some((m: any) => m.name === b.upstreamModelId)) {
        await (
          await request("/api/generate", {
            model: b.upstreamModelId,
            keep_alive: "5m",
            stream: false,
            options: { num_ctx: 4096 },
          })
        ).json();
        ps = (await (await request("/api/ps")).json()) as any;
      }
      const loaded = ps.models?.find((m: any) => m.name === b.upstreamModelId);
      if (
        !loaded ||
        loaded.context_length !== 4096 ||
        "sha256:" + String(loaded.digest).replace(/^sha256:/, "") !== b.modelDigest ||
        !(loaded.size > 0) ||
        loaded.size_vram < loaded.size
      )
        throw new LocalError("model_unavailable", "gpu_offload_required");
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
    } catch (error) {
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
            retryable: false,
          },
        };
    } finally {
      controller.abort();
      await reader?.cancel().catch(() => {});
      reader?.releaseLock();
      release?.();
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", abort);
    }
  }
}
