import { SpanStatusCode, type Span, type Tracer as OtelTracer } from "@opentelemetry/api";
import type { Tracer } from "@athyper/server-foundation/observability";
import { describe, expect, it, vi } from "vitest";

import {
  createOpenTelemetryAdapter,
  createOpenTelemetryRuntime,
} from "../open-telemetry-adapter.js";
import { OpenTelemetryTracer } from "../open-telemetry-tracer.js";

describe("OpenTelemetry adapter lifecycle", () => {
  it("starts and shuts down its SDK exactly once", async () => {
    const sdk = {
      start: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = createOpenTelemetryRuntime(sdk, foundationTracer());

    expect(adapter.started).toBe(false);
    await Promise.all([adapter.start(), adapter.start()]);
    expect(adapter.started).toBe(true);
    expect(sdk.start).toHaveBeenCalledOnce();

    await Promise.all([adapter.shutdown(), adapter.shutdown()]);
    expect(adapter.started).toBe(false);
    expect(sdk.shutdown).toHaveBeenCalledOnce();
  });

  it("allows a failed start to be retried", async () => {
    const sdk = {
      start: vi
        .fn()
        .mockRejectedValueOnce(new Error("collector unavailable"))
        .mockResolvedValueOnce(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = createOpenTelemetryRuntime(sdk, foundationTracer());

    await expect(adapter.start()).rejects.toThrow("collector unavailable");
    await expect(adapter.start()).resolves.toBeUndefined();
    expect(sdk.start).toHaveBeenCalledTimes(2);
  });

  it("does not initialize an SDK that is shut down before start", async () => {
    const sdk = {
      start: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = createOpenTelemetryRuntime(sdk, foundationTracer());

    await adapter.shutdown();

    expect(sdk.start).not.toHaveBeenCalled();
    expect(sdk.shutdown).not.toHaveBeenCalled();
    await expect(adapter.start()).rejects.toThrow("cannot restart");
  });

  it("validates explicit SDK configuration without reading environment state", () => {
    expect(() =>
      createOpenTelemetryAdapter({
        endpoint: "not-a-url",
        serviceName: "platform-host",
        environment: "local",
        processMode: "api",
      }),
    ).toThrow("endpoint");
    expect(() =>
      createOpenTelemetryAdapter({
        endpoint: "http://localhost:4317",
        serviceName: " ",
        environment: "local",
        processMode: "api",
      }),
    ).toThrow("service name");
  });
});

describe("Foundation tracer implementation", () => {
  it("forwards standalone span attributes, exceptions, and end", () => {
    const { tracer, span } = otelTracer();
    const adapter = new OpenTelemetryTracer("test-scope", undefined, tracer);
    const started = adapter.startSpan("operation");
    const error = new Error("failed");

    started.setAttributes({ tenant: "one", count: 2, enabled: true });
    started.recordException(error);
    started.end();

    expect(span.setAttributes).toHaveBeenCalledWith({
      tenant: "one",
      count: 2,
      enabled: true,
    });
    expect(span.recordException).toHaveBeenCalledWith(error);
    expect(span.end).toHaveBeenCalledOnce();
  });

  it("marks successful active spans OK and ends them", async () => {
    const { tracer, span } = otelTracer();
    const adapter = new OpenTelemetryTracer("test-scope", undefined, tracer);

    await expect(
      adapter.startActiveSpan("save-record", async () => "saved"),
    ).resolves.toBe("saved");

    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
    expect(span.recordException).not.toHaveBeenCalled();
    expect(span.end).toHaveBeenCalledOnce();
  });

  it("records active-span failures, marks ERROR, and rethrows", async () => {
    const { tracer, span } = otelTracer();
    const adapter = new OpenTelemetryTracer("test-scope", undefined, tracer);
    const failure = new Error("write failed");

    await expect(
      adapter.startActiveSpan("save-record", async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(span.recordException).toHaveBeenCalledWith(failure);
    expect(span.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: "write failed",
    });
    expect(span.end).toHaveBeenCalledOnce();
  });

  it("rejects empty span names before delegating", () => {
    const { tracer } = otelTracer();
    const adapter = new OpenTelemetryTracer("test-scope", undefined, tracer);

    expect(() => adapter.startSpan(" ")).toThrow("span name");
  });
});

function foundationTracer(): Tracer {
  return {
    startSpan: vi.fn(),
    startActiveSpan: vi.fn(),
    getActiveSpanContext: vi.fn(),
  } as unknown as Tracer;
}

function otelTracer() {
  const span = {
    setAttributes: vi.fn(),
    recordException: vi.fn(),
    setStatus: vi.fn(),
    end: vi.fn(),
    spanContext: vi.fn().mockReturnValue({ traceId: "trace", spanId: "span" }),
  } as unknown as Span & {
    setAttributes: ReturnType<typeof vi.fn>;
    recordException: ReturnType<typeof vi.fn>;
    setStatus: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
  const tracer = {
    startSpan: vi.fn().mockReturnValue(span),
    startActiveSpan: vi.fn(
      async <Result>(
        _name: string,
        work: (activeSpan: Span) => Promise<Result>,
      ): Promise<Result> => work(span),
    ),
  } as unknown as OtelTracer;
  return { tracer, span };
}
