import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import https from "node:https";
import test from "node:test";
const root = resolve(import.meta.dirname, "../../..");
const YAML = createRequire(join(root, "deploy/stackctl/package.json"))("yaml");
const enabled = process.env.ATHYPER_PUBLICATION_TLS_TESTS === "true";
function run(program, args) {
  const r = spawnSync(program, args, { encoding: "utf8", timeout: 60000 });
  if (r.status !== 0) throw Error(r.stderr || r.error?.message);
  return r.stdout.trim();
}
test(
  "publication TLS forwards with verified certificate and unprivileged Traefik after restart",
  { skip: !enabled },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "tls-audit-"));
    chmodSync(directory, 0o755);
    const project = "tls-audit-" + Date.now(),
      file = join(directory, "compose.json");
    const compose = (...args) =>
      run("docker", ["compose", "-p", project, "-f", file, ...args]);
    try {
      run("openssl", [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        join(directory, "key.pem"),
        "-out",
        join(directory, "cert.pem"),
        "-days",
        "1",
        "-subj",
        "/CN=secrets.dev.athyper.test",
        "-addext",
        "subjectAltName=DNS:secrets.dev.athyper.test",
      ]);
      const service = YAML.parse(
        readFileSync(
          join(
            root,
            "deploy/compose/instance/compose.publication-secretstore.yaml",
          ),
          "utf8",
        ),
      ).services["publication-secretstore-tls"];
      delete service.profiles;
      delete service.build;
      service.image = "athyper/traefik:3.7.13-hardened";
      service.user = `${process.getuid()}:${process.getgid()}`;
      service.restart = "no";
      service.ports = ["127.0.0.1::8443"];
      service.volumes = service.volumes.map((value) =>
        resolve(root, "deploy/compose/instance", value),
      );
      service.networks = ["app"];
      const backend = {
        image: "node:24.19.0-bookworm-slim",
        command: [
          "node",
          "-e",
          "require('http').createServer((q,r)=>r.end('audit-backend')).listen(8080,'0.0.0.0')",
        ],
        networks: ["app"],
        healthcheck: {
          test: [
            "CMD",
            "node",
            "-e",
            "fetch('http://127.0.0.1:8080').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
          ],
          interval: "1s",
          timeout: "3s",
          retries: 15,
        },
      };
      // Use an existing local Node image, avoiding a pull for a disposable backend.
      backend.image = "venatum/bull-board:3.3.17";
      backend.entrypoint = ["node"];
      backend.command = backend.command.slice(1);
      writeFileSync(
        file,
        JSON.stringify({
          services: {
            "publication-secretstore-tls": service,
            secretstore: backend,
          },
          networks: { app: {} },
          secrets: {
            "publication-tls-certificate": {
              file: join(directory, "cert.pem"),
            },
            "publication-tls-private-key": { file: join(directory, "key.pem") },
          },
        }),
      );
      compose("up", "-d");
      for (const round of [0, 1]) {
        if (round) compose("restart", "publication-secretstore-tls");
        const port = Number(
          compose("port", "publication-secretstore-tls", "8443")
            .split(":")
            .at(-1),
        );
        const request = () =>
          new Promise((done, fail) => {
            const req = https.get(
              {
                hostname: "127.0.0.1",
                port,
                servername: "secrets.dev.athyper.test",
                headers: { Host: "secrets.dev.athyper.test" },
                ca: readFileSync(join(directory, "cert.pem")),
                timeout: 2000,
              },
              (res) => {
                let body = "";
                res.on("data", (c) => (body += c));
                res.on("end", () => done({ status: res.statusCode, body }));
              },
            );
            req.on("error", fail);
            req.on("timeout", () => req.destroy());
          });
        let response;
        for (let i = 0; i < 30; i++) {
          try {
            response = await request();
            if (response.status === 200) break;
          } catch {}
          await new Promise((r) => setTimeout(r, 300));
        }
        assert.deepEqual(response, { status: 200, body: "audit-backend" });
        const status = compose(
          "exec",
          "-T",
          "publication-secretstore-tls",
          "sh",
          "-c",
          'for f in /proc/[0-9]*/status; do if grep -q \'^Name:[[:space:]]*traefik$\' "$f"; then cat "$f"; fi; done',
        );
        assert.match(status, new RegExp(`Uid:\\s+${process.getuid()}\\s`));
        assert.match(status, /CapEff:\s+0+\n/);
        assert.match(status, /CapPrm:\s+0+\n/);
        assert.match(status, /CapAmb:\s+0+\n/);
        const init = compose(
          "exec",
          "-T",
          "publication-secretstore-tls",
          "cat",
          "/proc/1/comm",
        );
        assert.match(init, /init/);
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
