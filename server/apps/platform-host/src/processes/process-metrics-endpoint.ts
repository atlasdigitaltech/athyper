import { createServer, type Server } from "node:http";
import type { PrometheusMetricsRegistry } from "@athyper/server-adapter-telemetry-otel";

export interface ProcessMetricsEndpoint {
  readonly port: number;
  stop(): Promise<void>;
}

/** Private, dependency-free Prometheus endpoint on a dedicated runtime listener. */
export async function startProcessMetricsEndpoint(
  exporter: PrometheusMetricsRegistry,
  options: { readonly port?: number; readonly host?: string } = {},
): Promise<ProcessMetricsEndpoint> {
  const port =
      options.port ?? readPort(process.env["PROCESS_METRICS_PORT"] ?? "9464"),
    host =
      options.host ??
      (process.env["PROCESS_METRICS_HOST"]?.trim() || "0.0.0.0");
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/metrics") {
      response.writeHead(200, {
        "content-type": "text/plain; version=0.0.4; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(exporter.render());
      return;
    }
    if (request.method === "GET" && request.url === "/livez") {
      response.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end('{"status":"ok"}\n');
      return;
    }
    response.writeHead(404, {
      "content-type": "application/problem+json",
      "cache-control": "no-store",
    });
    response.end('{"type":"about:blank","title":"Not Found","status":404}\n');
  });
  await listen(server, port, host);
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Process metrics endpoint address is unavailable");
  return { port: address.port, stop: () => close(server) };
}

function readPort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error("PROCESS_METRICS_PORT must be an integer from 1 to 65535");
  return port;
}
function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const fail = (error: Error) => {
        server.off("listening", ready);
        reject(error);
      },
      ready = () => {
        server.off("error", fail);
        resolve();
      };
    server.once("error", fail);
    server.once("listening", ready);
    server.listen(port, host);
  });
}
function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
