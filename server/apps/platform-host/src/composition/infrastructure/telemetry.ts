import {
  createOpenTelemetryMetricsRegistry,
  createOpenTelemetryAdapter,
  createPrometheusMetricsRegistry,
  type OpenTelemetryAdapter,
} from "@athyper/server-adapter-telemetry-otel";
import type { LifecycleManager } from "@athyper/server-foundation/lifecycle";
import type { HostConfig } from "../../config/environment.js";
import type { Container } from "../../kernel/container.js";
import type { AdapterRegistrationDependencies } from "./adapter-contract.js";

export type TelemetryRegistrationDependencies = Pick<
  AdapterRegistrationDependencies,
  "createOpenTelemetry"
>;

const DEFAULT_DEPENDENCIES: TelemetryRegistrationDependencies = {
  createOpenTelemetry: createOpenTelemetryAdapter,
};

export function registerTelemetry(
  container: Container,
  config: HostConfig,
  lifecycle: LifecycleManager,
  overrides: Partial<TelemetryRegistrationDependencies> = {},
) {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  let openTelemetry: OpenTelemetryAdapter | undefined;

  if (config.openTelemetry.endpoint) {
    openTelemetry = dependencies.createOpenTelemetry({
      endpoint: config.openTelemetry.endpoint,
      serviceName: config.openTelemetry.serviceName,
      serviceVersion: config.openTelemetry.serviceVersion,
      environment: config.env,
      processMode: config.mode,
      enableAutoInstrumentations:
        config.openTelemetry.enableAutoInstrumentations,
    });
    container.adapters.openTelemetry = openTelemetry;
    lifecycle.onReady(() => openTelemetry!.start());
  }
  // Own cleanup immediately; the combined registrar also places this idempotent
  // handler last so telemetry flushes before infrastructure during normal shutdown.
  let shutdown: Promise<void> | undefined;
  const close = () =>
    (shutdown ??= Promise.resolve().then(() => openTelemetry?.shutdown()));
  lifecycle.onShutdown(close);
  container.adapters.processMetrics =
    openTelemetry?.prometheus ??
    createPrometheusMetricsRegistry(
      createOpenTelemetryMetricsRegistry(
        `${config.openTelemetry.serviceName}-${config.mode}`,
        config.openTelemetry.serviceVersion,
      ),
    );

  return close;
}
