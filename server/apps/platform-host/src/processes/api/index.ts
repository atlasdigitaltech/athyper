import { createServer } from "node:http";
import { createLifecycle } from "@athyper/server-foundation/lifecycle";
import { createHttpApplication } from "@athyper/server-runtime-http";
import { createRedisRateLimitStore } from "@athyper/server-adapter-cache-redis";

import { loadConfig } from "../../config/index.js";
import { createContainer } from "../../composition/create-container.js";
import { registerAdapters } from "../../composition/register-adapters.js";
import { registerPlatform } from "../../composition/register-platform.js";
import { registerRuntimes } from "../../composition/register-runtimes.js";
import { registerServices } from "../../composition/register-services.js";
import { captureOperationalError } from "../../monitoring/error-collector.js";

export async function start(): Promise<void> {
  const config = loadConfig();
  const lifecycle = createLifecycle();
  const container = createContainer();
  registerAdapters(container, config, lifecycle);
  registerRuntimes(container, config, lifecycle);
  registerPlatform(container, config);
  registerServices(container, {}, config);

  const app = createHttpApplication({
    healthRegistry: container.runtimes.health,
    environment: config.env,
    onUnexpectedError(error, request) {
      captureOperationalError(error, {
        "http.method": request.method,
        "http.path": request.path,
      });
    },
    requestDeadlineMs: 60_000,
    rateLimit: {
      windowMs: 60_000,
      maxRequests: 100,
      exemptPaths: ["/livez", "/readyz", "/healthz", "/health", "/metrics"],
      ...(container.adapters.redisCache ? { store: createRedisRateLimitStore(container.adapters.redisCache.client) } : {}),
      onStoreError(error) { captureOperationalError(error, { capability: "http.rate-limit" }); },
    },
    ...(container.adapters.openTelemetry?.prometheus ? { metrics: { exporter: container.adapters.openTelemetry.prometheus } } : {}),
    configure(application) {
      for (const register of container.platform.httpRegistrars) register(application);
    },
  });
  const server = createServer(app);
  server.requestTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.keepAliveTimeout = 5_000;

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[api] shutdown signal=${signal} pid=${process.pid}`);
    server.close();
    await Promise.race([
      lifecycle.shutdown(signal),
      new Promise<void>((resolve) => setTimeout(resolve, config.shutdownTimeoutMs)),
    ]);
    process.exit(0);
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, () => {
      console.log(`[api] started port=${config.port} env=${config.env} pid=${process.pid}`);
      resolve();
    });
  });

  await lifecycle.signalReady();
}
