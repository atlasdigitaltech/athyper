import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
const root = resolve(import.meta.dirname, "../../..");
const YAML = createRequire(resolve(root, "deploy/stackctl/package.json"))(
  "yaml",
);
const service = YAML.parse(
  readFileSync(
    resolve(root, "deploy/compose/instance/compose.parity.yaml"),
    "utf8",
  ),
).services.virusscan;
function run(args, input) {
  const r = spawnSync("docker", args, {
    encoding: "utf8",
    input,
    timeout: 60000,
  });
  if (r.status !== 0) throw Error(r.stderr);
  return r.stdout.trim();
}
test(
  "ClamAV config and scans work with immutable root, including restart",
  {
    skip: process.env.ATHYPER_VIRUSSCAN_READONLY_TESTS !== "true",
    timeout: 180000,
  },
  async () => {
    const name = "clamav-readonly-" + Date.now();
    try {
      run([
        "run",
        "-d",
        "--name",
        name,
        "--network",
        "none",
        "-v",
        "/var/lib/clamav",
        "--read-only",
        ...service.tmpfs.flatMap((path) => ["--tmpfs", path]),
        ...service.cap_drop.flatMap((cap) => ["--cap-drop", cap]),
        ...service.cap_add.flatMap((cap) => ["--cap-add", cap]),
        "--security-opt",
        "no-new-privileges:true",
        "--memory",
        service.mem_limit,
        ...Object.entries(service.environment).flatMap(([key, value]) => [
          "-e",
          `${key}=${value}`,
        ]),
        "-v",
        `${root}/deploy/compose/instance/scripts/start-clamav.sh:/start.sh:ro`,
        "--entrypoint",
        "/bin/sh",
        service.image.replace(/\$\{[^:}]+:-([^}]+)\}/g, "$1"),
        "/start.sh",
      ]);
      for (const round of [0, 1]) {
        if (round) run(["restart", name]);
        let ready = false;
        for (let i = 0; i < 75; i++) {
          try {
            if (
              run([
                "exec",
                name,
                "sh",
                "-c",
                "echo PING | nc -w 2 127.0.0.1 3310",
              ]).includes("PONG")
            ) {
              ready = true;
              break;
            }
          } catch {}
          const state = JSON.parse(run(["inspect", name]))[0].State;
          if (state.Status === "exited") {
            const logs = spawnSync("docker", ["logs", name], {
              encoding: "utf8",
            });
            throw Error(logs.stdout + logs.stderr);
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        assert.ok(ready, "clamd did not start");
        assert.match(
          run(["exec", name, "cat", "/tmp/clamav-config/clamd.conf"]),
          /StreamMaxLength 100M/,
        );
        assert.match(
          run(["exec", name, "cat", "/tmp/clamav-config/freshclam.conf"]),
          /NotifyClamd \/tmp\/clamav-config\/clamd.conf/,
        );
        run(
          ["exec", "-i", name, "sh", "-c", "cat > /tmp/clean.txt"],
          "clean fixture",
        );
        assert.match(
          run(["exec", name, "clamdscan", "--stream", "/tmp/clean.txt"]),
          /OK/,
        );
        const eicar =
          "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
        run(["exec", "-i", name, "sh", "-c", "cat > /tmp/eicar.txt"], eicar);
        const infected = spawnSync(
          "docker",
          ["exec", name, "clamdscan", "--stream", "/tmp/eicar.txt"],
          { encoding: "utf8" },
        );
        assert.equal(infected.status, 1);
        assert.match(infected.stdout, /FOUND/);
        assert.match(
          run([
            "exec",
            name,
            "sh",
            "-c",
            'ps -o user,args | grep "[f]reshclam --config-file"',
          ]),
          /clamav/,
        );
      }
      // Offline test uses bundled signatures; it does not bypass or claim the
      // production healthcheck's signature-freshness guarantee.
    } finally {
      spawnSync("docker", ["rm", "-f", "-v", name], { encoding: "utf8" });
    }
  },
);
