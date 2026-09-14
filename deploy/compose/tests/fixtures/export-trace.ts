import { createOpenTelemetryAdapter } from "../../../../server/packages/adapters/telemetry-otel/src/open-telemetry-adapter.js";

async function main() {
  const adapter = createOpenTelemetryAdapter({
    endpoint: process.env["AUDIT_OTLP_ENDPOINT"]!,
    serviceName: "wiring-audit-api",
    environment: "testing",
    processMode: "api",
  });
  await adapter.start();
  const span = adapter.tracer.startSpan("wiring-audit-span");
  span.setAttributes({ "audit.fixture": true });
  span.end();
  await adapter.shutdown();
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
