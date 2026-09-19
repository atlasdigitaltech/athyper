import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  chmodSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
const root = resolve(import.meta.dirname, "../../..");
const YAML = createRequire(join(root, "deploy/stackctl/package.json"))("yaml");
const enabled = process.env.ATHYPER_OBSERVABILITY_TESTS === "true";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function docker(...args) {
  const r = spawnSync("docker", args, { encoding: "utf8", timeout: 60000 });
  if (r.status !== 0) throw Error(r.stderr || r.error?.message);
  return r.stdout.trim();
}
for (const scope of ["instance", "operations"])
  test(
    `${scope} observability has writable bounded tmp, ingests data and restarts`,
    { skip: !enabled },
    async () => {
      const directory = mkdtempSync(join(tmpdir(), "observability-audit-"));
      chmodSync(directory, 0o755);
      const project = "obs-audit-" + Date.now(),
        file = join(directory, "compose.json");
      const sourceDir = join(root, "deploy/compose", scope);
      const source = YAML.parse(
        readFileSync(
          join(
            sourceDir,
            scope === "instance" ? "compose.optional.yaml" : "compose.yaml",
          ),
          "utf8",
        ),
      );
      const helper = project + "-helper";
      const compose = (...args) =>
        docker("compose", "-p", project, "-f", file, ...args);
      try {
        // A read-only diagnostic executable lets us test distroless images without
        // installing tools or changing their application user/capabilities.
        docker("create", "--name", helper, "athyper/redis:7.4.8-hardened");
        docker("cp", helper + ":/bin/busybox", join(directory, "busybox"));
        docker(
          "cp",
          helper + ":/lib/ld-musl-x86_64.so.1",
          join(directory, "ld-musl.so"),
        );
        docker("rm", helper);
        mkdirSync(join(directory, "targets"));
        writeFileSync(join(directory, "targets/fixture.json"), "[]");
        writeFileSync(join(directory, "password"), "audit-only", {
          mode: 0o600,
        });
        const names = [
          "metrics",
          "tracing",
          "alertmanager",
          ...(scope === "instance"
            ? ["memorycache-exporter", "telemetry"]
            : ["logging"]),
        ];
        const ports = {
          metrics: 9090,
          logging: 3100,
          tracing: 3200,
          alertmanager: 9093,
          "memorycache-exporter": 9121,
          telemetry: 3000,
        };
        const services = {},
          volumes = {};
        for (const name of names) {
          const service = structuredClone(source.services[name]);
          delete service.profiles;
          if (name !== "telemetry") delete service.depends_on;
          delete service.build;
          service.restart = "no";
          service.networks = ["test"];
          service.ports = [`127.0.0.1::${ports[name]}`];
          if (name === "tracing") service.ports.push("127.0.0.1::4318");
          service.volumes = (service.volumes ?? []).map((value) => {
            if (value.includes("${ATHYPER_RUNTIME_ROOT"))
              return `${directory}/targets:/etc/prometheus/targets:ro`;
            if (value.startsWith(".")) return resolve(sourceDir, value);
            const volume = value.split(":")[0];
            volumes[volume] = {};
            return value;
          });
          service.volumes.push(`${directory}:/audit:ro`);
          services[name] = service;
        }
        if (scope === "instance") {
          services["memorycache-exporter"].user =
            `${process.getuid()}:${process.getgid()}`;
          services.memorycache = {
            image: "athyper/redis:7.4.8-hardened",
            command: ["redis-server", "--requirepass", "audit-only"],
            networks: ["test"],
          };
        }
        // Exercise Grafana's actual dependency contract without provisioning a dashboard.
        const dependencies = structuredClone(
          source.services.telemetry.depends_on,
        );
        for (const dependency of Object.values(dependencies))
          assert.equal(dependency.condition, "service_healthy");
        services["readiness-gate"] = {
          image: "busybox:1.36",
          command: ["sleep", "3600"],
          depends_on: dependencies,
          networks: ["test"],
        };
        writeFileSync(
          file,
          JSON.stringify({
            services,
            volumes,
            networks: { test: {} },
            secrets: {
              "redis-password": { file: join(directory, "password") },
              "grafana-admin-password": { file: join(directory, "password") },
            },
          }),
        );
        compose("up", "-d");
        const gate = JSON.parse(
          docker("inspect", compose("ps", "-q", "readiness-gate")),
        )[0];
        for (const name of Object.keys(dependencies)) {
          const dependency = JSON.parse(
            docker("inspect", compose("ps", "-q", name)),
          )[0];
          assert.equal(dependency.State.Health.Status, "healthy");
          assert.ok(
            dependency.State.Health.Log.some(
              (check) =>
                check.ExitCode === 0 &&
                Date.parse(check.End) <= Date.parse(gate.State.StartedAt),
            ),
            `${name} must pass readiness before the dependent starts`,
          );
        }
        const url = (name, path, port = ports[name]) =>
          `http://${compose("port", name, String(port))}${path}`;
        async function ready(name, path) {
          for (let i = 0; i < 90; i++) {
            try {
              if (
                (
                  await fetch(url(name, path), {
                    signal: AbortSignal.timeout(1500),
                  })
                ).ok
              )
                return;
            } catch {}
            await pause(1000);
          }
          throw Error(`${scope}/${name} never became ready`);
        }
        const endpoints = {
          metrics: "/-/ready",
          logging: "/ready",
          tracing: "/ready",
          alertmanager: "/-/ready",
          "memorycache-exporter": "/metrics",
          telemetry: "/api/health",
        };
        for (const round of [0, 1]) {
          if (round) compose("restart", ...names);
          await Promise.all(names.map((name) => ready(name, endpoints[name])));
          for (const name of names.filter((name) =>
            ["metrics", "logging", "tracing"].includes(name),
          )) {
            let healthy = false;
            for (let i = 0; i < 30; i++) {
              const metadata = JSON.parse(
                docker("inspect", compose("ps", "-q", name)),
              )[0];
              if (metadata.State.Health?.Status === "healthy") {
                healthy = true;
                break;
              }
              await pause(1000);
            }
            assert.ok(
              healthy,
              `${name} Docker healthcheck must pass after start/restart`,
            );
          }
          for (const name of names) {
            const status = compose(
              "exec",
              "-T",
              name,
              "/audit/ld-musl.so",
              "/audit/busybox",
              "cat",
              "/proc/1/status",
            );
            const uid = status.match(/^Uid:\s+(\d+)/m)[1],
              gid = status.match(/^Gid:\s+(\d+)/m)[1];
            compose(
              "exec",
              "-T",
              "--user",
              `${uid}:${gid}`,
              name,
              "/audit/ld-musl.so",
              "/audit/busybox",
              "sh",
              "-c",
              "echo ok > /tmp/audit-probe && test -s /tmp/audit-probe",
            );
            const metadata = JSON.parse(
              docker("inspect", compose("ps", "-q", name)),
            )[0];
            if (name === "telemetry")
              assert.ok(Object.hasOwn(metadata.HostConfig.Tmpfs, "/tmp"));
            else
              assert.match(metadata.HostConfig.Tmpfs["/tmp"], /size=(8|32)m/);
          }
          const stamp = (BigInt(Date.now()) * 1000000n).toString();
          if (scope === "operations") {
            const logs = await fetch(url("logging", "/loki/api/v1/push"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                streams: [
                  {
                    stream: { audit: "tmpfs" },
                    values: [[stamp, `round-${round}`]],
                  },
                ],
              }),
            });
            assert.equal(logs.status, 204);
            const query = await fetch(
              url(
                "logging",
                "/loki/api/v1/query_range?query=" +
                  encodeURIComponent('{audit="tmpfs"}'),
              ),
            );
            assert.equal(query.status, 200);
            assert.match(await query.text(), new RegExp(`round-${round}`));
          }
          const trace = await fetch(url("tracing", "/v1/traces", 4318), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              resourceSpans: [
                {
                  scopeSpans: [
                    {
                      spans: [
                        {
                          traceId: "0123456789abcdef0123456789abcdef",
                          spanId: "0123456789abcdef",
                          name: "audit",
                          startTimeUnixNano: stamp,
                          endTimeUnixNano: (
                            BigInt(stamp) + 1000000n
                          ).toString(),
                        },
                      ],
                    },
                  ],
                },
              ],
            }),
          });
          assert.equal(trace.status, 200);
          const alerts = await fetch(url("alertmanager", "/api/v2/alerts"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([
              {
                labels: { alertname: "TmpfsAudit", audit: "disposable" },
                startsAt: new Date().toISOString(),
              },
            ]),
          });
          assert.equal(alerts.status, 200);
          let scraped = false;
          for (let i = 0; i < 40; i++) {
            const q = await (
              await fetch(url("metrics", "/api/v1/query?query=up"))
            ).json();
            if (q.data?.result.some((v) => v.value[1] === "1")) {
              scraped = true;
              break;
            }
            await pause(1000);
          }
          assert.ok(scraped, "Prometheus must successfully scrape");
          if (scope === "instance")
            assert.match(
              await (
                await fetch(url("memorycache-exporter", "/metrics"))
              ).text(),
              /redis_up 1/,
            );
        }
      } finally {
        try {
          compose("down", "--volumes", "--timeout", "5");
        } finally {
          spawnSync("docker", ["rm", "-f", helper]);
          rmSync(directory, { recursive: true, force: true });
        }
      }
    },
  );
