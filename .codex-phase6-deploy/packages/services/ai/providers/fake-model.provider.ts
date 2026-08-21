import type {
  CanonicalStreamEvent,
  IModelProvider,
  ModelPrompt,
  ModelResponse,
  ProviderCapabilities,
  ProviderInvocation,
  ProviderOperationalState,
} from "./i-model-provider.js";

export type FakeProviderStep =
  | CanonicalStreamEvent
  | { kind: "delay"; milliseconds: number }
  | { kind: "throw"; error?: Error }
  | { kind: "wait_for_abort" };

export interface FakeModelProviderOptions {
  providerId?: string;
  adapterId?: string;
  adapterVersion?: string;
  actualModelId?: string | ((invocation: ProviderInvocation) => string);
  providerRequestId?: string | null;
  steps?:
    | readonly FakeProviderStep[]
    | ((
        invocation: ProviderInvocation,
        invocationIndex: number,
      ) => readonly FakeProviderStep[]);
  operationalState?: ProviderOperationalState;
  emitIncompleteOnScriptEnd?: boolean;
}

/**
 * Deterministic provider used by unit tests and CI. It records complete
 * invocations, supports cancellation, and never needs network credentials.
 */
export class FakeModelProvider implements IModelProvider {
  readonly modelId = "fake-model-provider";
  readonly modelVersion = "fake-v1";
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly operationalState: ProviderOperationalState;
  readonly invocations: ProviderInvocation[] = [];
  cancellationObserved = false;
  readonly capabilities: ProviderCapabilities = {
    supports_vision: false,
    supports_pdf_native: false,
    supports_json_schema: false,
    supports_tool_calling: true,
    supports_embeddings: false,
    supports_streaming: true,
    max_context_tokens: 16_000,
    max_output_tokens: 4_096,
    max_input_file_bytes: 0,
    supported_mime_types: ["text/plain"],
    supported_regions: ["test"],
    cost_per_1k_input_tokens: 0,
    cost_per_1k_output_tokens: 0,
  };

  private readonly providerId: string;
  private readonly actualModelId:
    | string
    | ((invocation: ProviderInvocation) => string);
  private readonly providerRequestId: string | null;
  private readonly steps:
    | readonly FakeProviderStep[]
    | ((
        invocation: ProviderInvocation,
        invocationIndex: number,
      ) => readonly FakeProviderStep[]);
  private readonly emitIncompleteOnScriptEnd: boolean;

  constructor(options: FakeModelProviderOptions = {}) {
    this.providerId = options.providerId ?? "fake";
    this.adapterId = options.adapterId ?? "fake-text";
    this.adapterVersion = options.adapterVersion ?? "1";
    this.actualModelId =
      options.actualModelId
      ?? ((invocation: ProviderInvocation) => invocation.binding.upstreamModelId);
    this.providerRequestId = options.providerRequestId ?? "fake-request-1";
    this.steps = options.steps ?? [
      { kind: "text_delta", text: "Fake response" },
      {
        kind: "usage",
        mode: "snapshot",
        final: true,
        usage: { input_tokens: 1, output_tokens: 2 },
      },
      { kind: "completed", reason: "stop" },
    ];
    this.emitIncompleteOnScriptEnd = options.emitIncompleteOnScriptEnd ?? true;
    this.operationalState = options.operationalState ?? {
      implemented: true,
      credentialed: true,
      healthy: true,
      eligible: true,
    };
  }

  async invoke(_prompt: ModelPrompt): Promise<ModelResponse> {
    return {
      text: "Fake response",
      usage: { input_tokens: 1, output_tokens: 2, vision_pages: 0 },
      duration_ms: 0,
    };
  }

  async *invokeStream(
    invocation: ProviderInvocation,
  ): AsyncIterable<CanonicalStreamEvent> {
    const invocationIndex = this.invocations.length;
    this.invocations.push(invocation);
    if (invocation.signal?.aborted) {
      this.cancellationObserved = true;
      yield { kind: "cancelled" };
      return;
    }

    const actualModelId = typeof this.actualModelId === "function"
      ? this.actualModelId(invocation)
      : this.actualModelId;
    yield {
      kind: "response_started",
      provider_id: this.providerId,
      provider_request_id: this.providerRequestId,
      actual_model_id: actualModelId,
    };

    const steps = typeof this.steps === "function"
      ? this.steps(invocation, invocationIndex)
      : this.steps;
    for (const step of steps) {
      if (step.kind === "delay") {
        if (await delayWasAborted(step.milliseconds, invocation.signal)) {
          this.cancellationObserved = true;
          yield { kind: "cancelled" };
          return;
        }
        continue;
      }
      if (step.kind === "wait_for_abort") {
        await waitForAbort(invocation.signal);
        this.cancellationObserved = true;
        yield { kind: "cancelled" };
        return;
      }
      if (step.kind === "throw") {
        throw step.error ?? new Error("scripted fake provider failure");
      }
      if (invocation.signal?.aborted) {
        this.cancellationObserved = true;
        yield { kind: "cancelled" };
        return;
      }
      yield step;
      if (
        step.kind === "completed"
        || step.kind === "failed"
        || step.kind === "cancelled"
      ) {
        return;
      }
    }
    if (this.emitIncompleteOnScriptEnd) {
      yield {
        kind: "failed",
        error: {
          error_class: "stream_incomplete",
          code: "stream_ended_without_terminal",
          safe_message: "Atlas could not complete this response. Please try again.",
          retryable: true,
        },
      };
    }
  }
}

async function delayWasAborted(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return true;
  return await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(false);
    }, Math.max(0, milliseconds));
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve(true);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function waitForAbort(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  await new Promise<void>((resolve) => {
    signal?.addEventListener("abort", () => resolve(), { once: true });
  });
}
