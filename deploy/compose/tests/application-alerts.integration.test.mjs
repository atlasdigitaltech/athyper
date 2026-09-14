import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
const root = resolve(import.meta.dirname, "../../.."),
  YAML = createRequire(join(root, "deploy/stackctl/package.json"))("yaml");
const enabled = process.env.ATHYPER_APPLICATION_ALERT_TESTS === "true";
test(
  "both Prometheus stacks load application alerts and scrape the dedicated API listener",
  { skip: !enabled },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "application-alerts-"));
    chmodSync(directory, 0o755);
    const project = "app-alerts-" + Date.now(),
      file = join(directory, "compose.json");
    function docker(...args) {
      const r = spawnSync("docker", args, { encoding: "utf8", timeout: 60000 });
      if (r.status !== 0) throw Error(r.stderr);
      return r.stdout.trim();
    }
    const compose = (...args) =>
      docker("compose", "-p", project, "-f", file, ...args);
    try {
      mkdirSync(join(directory, "targets"));
      writeFileSync(
        join(directory, "targets/api.json"),
        JSON.stringify([
          {
            targets: ["api:9464"],
            labels: { instance: "audit", environment: "test", service: "api" },
          },
        ]),
      );
      const services = {
        api: {
          image: "venatum/bull-board:3.3.17",
          entrypoint: ["node"],
          command: [
            "-e",
            "import('/audit/process-metrics-endpoint.ts').then(({startProcessMetricsEndpoint})=>startProcessMetricsEndpoint({render:()=> 'athyper_business_partner_metrics_collection_success 1\\n'}, {port:9464,host:'0.0.0.0'}))",
          ],
          volumes: [
            `${root}/server/apps/platform-host/src/processes/process-metrics-endpoint.ts:/audit/process-metrics-endpoint.ts:ro`,
          ],
          networks: ["test"],
        },
      };
      const volumes = {};
      for (const scope of ["instance", "operations"]) {
        const dir = join(root, "deploy/compose", scope),
          source = YAML.parse(
            readFileSync(
              join(
                dir,
                scope === "instance" ? "compose.optional.yaml" : "compose.yaml",
              ),
              "utf8",
            ),
          ).services.metrics;
        const s = structuredClone(source);
        delete s.profiles;
        delete s.healthcheck;
        s.networks = ["test"];
        s.ports = ["127.0.0.1::9090"];
        s.volumes = s.volumes.map((v) =>
          v.startsWith(".")
            ? resolve(dir, v)
            : v.includes("${ATHYPER_RUNTIME_ROOT")
              ? `${directory}/targets:/etc/prometheus/targets:ro`
              : `${scope}-data:/prometheus`,
        );
        volumes[`${scope}-data`] = {};
        services[scope] = s;
      }
      writeFileSync(
        file,
        JSON.stringify({ services, volumes, networks: { test: {} } }),
      );
      compose("up", "-d");
      for (const scope of ["instance", "operations"]) {
        const base = "http://" + compose("port", scope, "9090");
        let result;
        for (let i = 0; i < 50; i++) {
          try {
            result = await (
              await fetch(
                base +
                  "/api/v1/query?query=" +
                  encodeURIComponent('up{service="api"}'),
              )
            ).json();
            if (result.data?.result.some((r) => r.value[1] === "1")) break;
          } catch {}
          await new Promise((r) => setTimeout(r, 1000));
        }
        assert.ok(
          result.data.result.some((r) => r.value[1] === "1"),
          `${scope}: API must be scraped`,
        );
        const rules = await (await fetch(base + "/api/v1/rules")).json();
        const names = rules.data.groups.flatMap((g) =>
          g.rules.map((r) => r.name),
        );
        for (const name of [
          "ApiHighErrorRate",
          "AthyperBusinessPartnerCaseFailureRateHigh",
          "AthyperBusinessPartnerNotificationDeadLetter",
        ])
          assert.ok(names.includes(name), `${scope}: missing ${name}`);
        assert.equal(
          names.filter((n) => n === "BusinessPartnerDeliveryDeadLetter").length,
          1,
        );
        assert.ok(
          !names.includes("AthyperBusinessPartnerDeliveryDeadLetter"),
          "do not load duplicate delivery alerts",
        );
      }
    } finally {
      try {
        compose("down", "--volumes", "--timeout", "5");
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  },
);
