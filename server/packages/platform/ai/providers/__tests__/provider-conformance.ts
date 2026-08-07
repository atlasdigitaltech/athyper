import { describe, expect, it } from "vitest";
import type {
  CanonicalStreamEvent,
  IModelProvider,
  ProviderInvocation,
} from "../i-model-provider.js";

export type ProviderConformanceScenario =
  | "normal"
  | "truncated"
  | "failure"
  | "cancellation";

export interface ProviderConformanceHarness {
  provider: IModelProvider;
  invocation: ProviderInvocation;
  requestedUpstreamModelIds(): readonly string[];
  abort?(): void;
}

export function defineProviderConformanceSuite(
  adapterName: string,
  createHarness: (
    scenario: ProviderConformanceScenario,
  ) => ProviderConformanceHarness,
  createToolHarness?: () => ProviderConformanceHarness,
): void {
  describe(`${adapterName} provider conformance`, () => {
    it("propagates the exact model and emits one ordered canonical terminal", async () => {
      const harness = createHarness("normal");
      const events = await collect(harness);

      expect(harness.provider.capabilities.supports_streaming).toBe(true);
      expect(typeof harness.provider.invokeStream).toBe("function");
      expect(events[0]).toMatchObject({
        kind: "response_started",
        provider_id: harness.invocation.binding.providerId,
        actual_model_id: harness.invocation.binding.upstreamModelId,
      });
      expect(harness.requestedUpstreamModelIds()).toEqual([
        harness.invocation.binding.upstreamModelId,
      ]);
      expect(terminalEvents(events)).toHaveLength(1);
      expect(events.at(-1)).toMatchObject({ kind: "completed" });
      expect(events.some((event) => (
        event.kind === "usage" && event.final
      ))).toBe(true);
    });

    it("normalizes a truncated stream as one safe terminal", async () => {
      const harness = createHarness("truncated");
      const events = await collect(harness);

      expect(terminalEvents(events)).toHaveLength(1);
      expect(events.at(-1)).toMatchObject({
        kind: "failed",
        error: {
          error_class: "stream_incomplete",
          retryable: true,
        },
      });
    });

    it("normalizes provider failures without leaking raw detail", async () => {
      const harness = createHarness("failure");
      const events = await collect(harness);

      expect(terminalEvents(events)).toHaveLength(1);
      expect(events.at(-1)).toMatchObject({ kind: "failed" });
      expect(JSON.stringify(events)).not.toContain("SECRET_PROVIDER_DETAIL");
    });

    it("propagates cancellation and closes upstream work", async () => {
      const harness = createHarness("cancellation");
      expect(harness.abort).toBeTypeOf("function");
      const iterator = harness.provider.invokeStream!(
        harness.invocation,
      )[Symbol.asyncIterator]();
      const events: CanonicalStreamEvent[] = [];
      const first = await iterator.next();
      if (!first.done) events.push(first.value);
      harness.abort!();
      while (true) {
        const next = await iterator.next();
        if (next.done) break;
        events.push(next.value);
      }

      expect(terminalEvents(events)).toEqual([{ kind: "cancelled" }]);
      expect(events.at(-1)).toEqual({ kind: "cancelled" });
    });

    if (createToolHarness) {
      it("keeps one stable call ID while accumulating canonical JSON arguments", async () => {
        const harness = createToolHarness();
        const events = await collect(harness);
        const starts = events.filter(
          (event) => event.kind === "tool_call_start",
        );
        const deltas = events.filter(
          (event) => event.kind === "tool_call_input_delta",
        );
        const completes = events.filter(
          (event) => event.kind === "tool_call_complete",
        );

        expect(starts).toHaveLength(1);
        expect(completes).toHaveLength(1);
        const callId = starts[0]?.kind === "tool_call_start"
          ? starts[0].call_id
          : null;
        expect(callId).toBeTruthy();
        expect(deltas.every((event) => (
          event.kind === "tool_call_input_delta"
          && event.call_id === callId
        ))).toBe(true);
        expect(completes[0]).toMatchObject({
          kind: "tool_call_complete",
          call_id: callId,
        });
        const json = deltas.map((event) => (
          event.kind === "tool_call_input_delta"
            ? event.json_fragment
            : ""
        )).join("");
        expect(JSON.parse(json)).toEqual(
          completes[0]?.kind === "tool_call_complete"
            ? completes[0].input
            : null,
        );
        expect(events.at(-1)).toEqual({
          kind: "completed",
          reason: "tool_call",
        });
      });
    }
  });
}

async function collect(
  harness: ProviderConformanceHarness,
): Promise<CanonicalStreamEvent[]> {
  const events: CanonicalStreamEvent[] = [];
  for await (const event of harness.provider.invokeStream!(harness.invocation)) {
    events.push(event);
  }
  return events;
}

function terminalEvents(
  events: readonly CanonicalStreamEvent[],
): CanonicalStreamEvent[] {
  return events.filter((event) => (
    event.kind === "completed"
    || event.kind === "failed"
    || event.kind === "cancelled"
  ));
}
