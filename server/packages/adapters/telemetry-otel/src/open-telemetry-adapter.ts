import type { MetricsRegistry, Tracer } from "@athyper/server-foundation/observability";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

import { OpenTelemetryTracer } from "./open-telemetry-tracer.js";
import { createOpenTelemetryMetricsRegistry } from "./open-telemetry-metrics.js";
import { createPrometheusMetricsRegistry, type PrometheusMetricsRegistry } from "./prometheus-metrics.js";

export interface OpenTelemetryAdapterConfig {
  readonly endpoint: string;
  readonly serviceName: string;
  readonly serviceVersion?: string;
  readonly environment: string;
  readonly processMode: string;
  readonly instrumentationScope?: string;
  readonly enableAutoInstrumentations?: boolean;
  readonly resourceAttributes?: Readonly<Record<string, string | number | boolean>>;
}

export interface OpenTelemetryAdapter {
  readonly tracer: Tracer;
  readonly metrics: MetricsRegistry;
  readonly prometheus?: PrometheusMetricsRegistry;
  readonly started: boolean;
  start(): Promise<void>;
  shutdown(): Promise<void>;
}

interface TelemetrySdk {
  start(): void | Promise<void>;
  shutdown(): Promise<void>;
}

export function createOpenTelemetryAdapter(
  config: OpenTelemetryAdapterConfig,
): OpenTelemetryAdapter {
  const resolved = validateConfig(config);
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: resolved.serviceName,
      [ATTR_SERVICE_VERSION]: resolved.serviceVersion,
      "deployment.environment.name": resolved.environment,
      "athyper.process.mode": resolved.processMode,
      ...resolved.resourceAttributes,
    }),
    traceExporter: new OTLPTraceExporter({ url: resolved.endpoint }),
    instrumentations: resolved.enableAutoInstrumentations
      ? [
          getNodeAutoInstrumentations({
            "@opentelemetry/instrumentation-fs": { enabled: false },
            "@opentelemetry/instrumentation-dns": { enabled: false },
          }),
        ]
      : [],
  });

  return createOpenTelemetryRuntime(
    sdk,
    new OpenTelemetryTracer(
      resolved.instrumentationScope,
      resolved.serviceVersion,
    ),
    createOpenTelemetryMetricsRegistry(resolved.instrumentationScope,resolved.serviceVersion),
  );
}

export function createOpenTelemetryRuntime(
  sdk: TelemetrySdk,
  tracer: Tracer,
  metrics: MetricsRegistry = createOpenTelemetryMetricsRegistry("athyper"),
): OpenTelemetryAdapter {
  const prometheus = createPrometheusMetricsRegistry(metrics);
  let state: "idle" | "starting" | "started" | "stopped" = "idle";
  let startPromise: Promise<void> | undefined;
  let shutdownPromise: Promise<void> | undefined;

  return {
    tracer,
    metrics: prometheus,
    prometheus,
    get started() {
      return state === "started";
    },
    start() {
      if (state === "stopped") {
        return Promise.reject(
          new Error("OpenTelemetry adapter cannot restart after shutdown"),
        );
      }
      startPromise ??= (async () => {
        state = "starting";
        try {
          await sdk.start();
          state = "started";
        } catch (error) {
          state = "idle";
          startPromise = undefined;
          throw error;
        }
      })();
      return startPromise;
    },
    shutdown() {
      shutdownPromise ??= (async () => {
        if (startPromise) await startPromise;
        if (state === "started") await sdk.shutdown();
        state = "stopped";
      })();
      return shutdownPromise;
    },
  };
}

interface ResolvedConfig {
  readonly endpoint: string;
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly environment: string;
  readonly processMode: string;
  readonly instrumentationScope: string;
  readonly enableAutoInstrumentations: boolean;
  readonly resourceAttributes: Readonly<Record<string, string | number | boolean>>;
}

function validateConfig(config: OpenTelemetryAdapterConfig): ResolvedConfig {
  const endpoint = requireNonEmpty(config.endpoint, "OTLP endpoint");
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    throw new TypeError("OTLP endpoint is invalid");
  }
  if (endpointUrl.protocol !== "http:" && endpointUrl.protocol !== "https:") {
    throw new TypeError("OTLP endpoint must use HTTP or HTTPS");
  }

  const serviceName = requireNonEmpty(config.serviceName, "service name");
  return {
    endpoint: endpointUrl.toString().replace(/\/$/, ""),
    serviceName,
    serviceVersion: config.serviceVersion?.trim() || "0.0.0",
    environment: requireNonEmpty(config.environment, "deployment environment"),
    processMode: requireNonEmpty(config.processMode, "process mode"),
    instrumentationScope:
      config.instrumentationScope?.trim() || serviceName,
    enableAutoInstrumentations: config.enableAutoInstrumentations ?? false,
    resourceAttributes: config.resourceAttributes ?? {},
  };
}

function requireNonEmpty(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`OpenTelemetry ${name} must not be empty`);
  return normalized;
}
