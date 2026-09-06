import type { LifecycleManager } from "@athyper/server-foundation/lifecycle";
import type { Container } from "./create-container.js";
import { createBusinessPartnerMetricsCollector, type BusinessPartnerMetricsTarget } from "../monitoring/business-partner-metrics.js";
import { captureOperationalError } from "../monitoring/error-collector.js";

export function registerBusinessPartnerMetrics(container: Container, lifecycle: LifecycleManager, targets: readonly BusinessPartnerMetricsTarget[]): void {
  const database = container.adapters.neonDatabase;
  const metrics = container.adapters.processMetrics;
  if (!database || !metrics) return;
  const collector = createBusinessPartnerMetricsCollector({
    database, metrics, targets,
    onError(error, target) {
      captureOperationalError(error, { capability: "business-partner.metrics", "tenant.id": target.tenantId });
    },
  });
  lifecycle.onReady(() => collector.start());
  lifecycle.onShutdown(() => collector.close());
}
