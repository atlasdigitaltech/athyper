import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";
const YAML = createRequire(
  new URL("../../stackctl/package.json", import.meta.url),
)("yaml");
test(
  "ingress preserves TLS, BasicAuth, outage responses and three health ports",
  { skip: process.env.ATHYPER_INGRESS_TESTS !== "true" },
  () => {
    const dir = mkdtempSync(join(tmpdir(), "ingress-"));
    const project = dir.split("/").at(-1).toLowerCase();
    const run = (program, args) => {
      const r = spawnSync(program, args, { encoding: "utf8", timeout: 90000 });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout.trim();
    };
    const source = YAML.parse(
      readFileSync("deploy/compose/instance/compose.yaml", "utf8"),
    );
    const gateway = structuredClone(source.services.gateway);
    delete gateway.build;
    gateway.image =
      process.env.ATHYPER_IMAGE_TRAEFIK ?? "athyper/traefik:3.7.13-hardened";
    gateway.user = `${process.getuid()}:${process.getgid()}`;
    gateway.networks = ["test"];
    gateway.ports = ["127.0.0.1::8080", "127.0.0.1::8443"];
    gateway.command.push("--entrypoints.websecure.address=:8443");
    gateway.volumes = [`${dir}:/etc/traefik:ro`];
    const outage = structuredClone(source.services["gateway-outage"]);
    outage.networks = ["test"];
    outage.volumes = outage.volumes.map((v) =>
      resolve("deploy/compose/instance", v),
    );
    run("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      join(dir, "key.pem"),
      "-out",
      join(dir, "cert.pem"),
      "-days",
      "1",
      "-subj",
      "/CN=infra.test",
    ]);
    writeFileSync(
      join(dir, "dynamic.yaml"),
      YAML.stringify({
        tls: {
          certificates: [
            {
              certFile: "/etc/traefik/cert.pem",
              keyFile: "/etc/traefik/key.pem",
            },
          ],
        },
        http: {
          routers: {
            http: {
              rule: "Host(`infra.test`)",
              entryPoints: ["web"],
              service: "outage",
              middlewares: ["auth"],
            },
            https: {
              rule: "Host(`infra.test`)",
              entryPoints: ["websecure"],
              tls: {},
              service: "outage",
              middlewares: ["auth"],
            },
          },
          middlewares: {
            auth: {
              basicAuth: {
                users: [
                  "test:{SHA}" +
                    createHash("sha1").update("fixture").digest("base64"),
                ],
              },
            },
          },
          services: {
            outage: {
              loadBalancer: { servers: [{ url: "http://outage:8080" }] },
            },
          },
        },
      }),
    );
    const file = join(dir, "compose.json");
    writeFileSync(
      file,
      JSON.stringify({ services: { gateway, outage }, networks: { test: {} } }),
    );
    const compose = (...args) =>
      run("docker", ["compose", "-p", project, "-f", file, ...args]);
    try {
      compose("up", "-d", "--wait");
      for (const p of [8080, 8081, 8082])
        compose(
          "exec",
          "-T",
          "outage",
          "wget",
          "-qO-",
          "http://127.0.0.1:" + p + "/healthz",
        );
      for (const [protocol, p] of [
        ["http", 8080],
        ["https", 8443],
      ]) {
        const address = compose("port", "gateway", String(p));
        const args = [
          "-ksS",
          "-o",
          "/dev/null",
          "-w",
          "%{http_code}",
          "-H",
          "Host: infra.test",
          protocol + "://" + address + "/",
        ];
        assert.equal(run("curl", args), "401");
        assert.equal(run("curl", ["-u", "test:fixture", ...args]), "503");
      }
    } finally {
      compose("down", "--volumes", "--timeout", "5");
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
