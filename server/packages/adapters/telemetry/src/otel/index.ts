/**
 * OpenTelemetry NodeSDK initialiser — exports traces to Tempo via OTLP/gRPC.
 *
 * Init runs at the very top of app.ts, BEFORE any other codebase imports so
 * auto-instrumentations can patch express / pg / ioredis / http / undici at
 * require time. Reading env directly (not the Zod-validated config) is
 * intentional: the SDK must be live before loadConfig() executes.
 *
 * When OTEL_EXPORTER_OTLP_ENDPOINT is unset, initOtel() is a no-op. The
 * existing adapter-telemetry trace-context helpers (getOtelTraceContext,
 * withSpan) remain safe in that state — they resolve to undefined / pass-through
 * when no active span is present.
 *
 * Shutdown is wired via the returned handle. The caller must register
 * getOtelShutdown() with the kernel Lifecycle so pending spans flush on
 * SIGTERM/SIGINT before DB/Redis connections close.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

export interface OtelInitOptions {
  /** MODE value — "api" | "worker" | "scheduler". Tags traces for filtering. */
  mode: string;
}

let _sdk: NodeSDK | undefined;

export function initOtel(opts: OtelInitOptions): boolean {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint) return false;
  if (_sdk) return true;

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]:
        process.env.OTEL_SERVICE_NAME ??
        process.env.SERVICE_NAME ??
        "athyper-runtime",
      [ATTR_SERVICE_VERSION]: process.env.SERVICE_VERSION ?? "0.0.0",
      "deployment.environment":
        process.env.ENVIRONMENT ?? "local",
      "athyper.mode": opts.mode,
    }),
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
      }),
    ],
  });

  sdk.start();
  _sdk = sdk;
  return true;
}

export function isOtelEnabled(): boolean {
  return _sdk !== undefined;
}

/**
 * Returns a shutdown function for the kernel Lifecycle.
 * Safe to call when OTel is disabled — resolves immediately.
 *
 * Register LAST in app.ts so LIFO order flushes traces FIRST,
 * before DB / Redis clients disconnect.
 */
export function getOtelShutdown(): () => Promise<void> {
  return async () => {
    if (!_sdk) return;
    await _sdk.shutdown();
    _sdk = undefined;
  };
}
