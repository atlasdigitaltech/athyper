import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
test(
  "SeaweedFS reconciles, persists and enforces application/writer permissions",
  { skip: process.env.ATHYPER_SEAWEEDFS_TESTS !== "true", timeout: 180000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "seaweedfs-"));
    const name = `seaweedfs-test-${randomBytes(6).toString("hex")}`;
    const docker = (...args) =>
      execFileSync("docker", args, {
        encoding: "utf8",
        timeout: 60000,
        stdio: ["ignore", "pipe", "pipe"],
      });
    const secrets = [
      "minio-root-password",
      "objectstorage-app-access-key",
      "objectstorage-app-secret-key",
      "objectstorage-artifacts-writer-access-key",
      "objectstorage-artifacts-writer-secret-key",
    ];
    for (const key of secrets)
      writeFileSync(join(dir, key), randomBytes(24).toString("hex"), {
        mode: 0o600,
      });
    const client = (script) =>
      docker(
        "run",
        "--rm",
        "--network",
        name,
        "--user",
        "1000:1000",
        "--cap-drop",
        "ALL",
        "--cap-add",
        "DAC_READ_SEARCH",
        "--read-only",
        "--security-opt",
        "no-new-privileges:true",
        "-v",
        `${dir}:/run/secrets:ro`,
        "-e",
        `S3_ENDPOINT=http://${name}:9000`,
        "--entrypoint",
        "node",
        "athyper/s3-tools:1",
        `/app/${script}.mjs`,
      );
    try {
      docker("network", "create", "--internal", name);
      docker("volume", "create", name);
      docker(
        "run",
        "-d",
        "--name",
        name,
        "--network",
        name,
        "--user",
        "1000:1000",
        "--cap-drop",
        "ALL",
        "--cap-add",
        "DAC_READ_SEARCH",
        "--read-only",
        "--tmpfs",
        "/tmp",
        "--memory",
        "1024m",
        "--security-opt",
        "no-new-privileges:true",
        "-v",
        `${name}:/data`,
        "-v",
        `${dir}:/run/secrets:ro`,
        "athyper/seaweedfs:4.46-hardened",
      );
      const ready = async () => {
        for (let i = 0; i < 80; i++) {
          try {
            docker("exec", name, "nc", "-z", "127.0.0.1", "9000");
            return;
          } catch {
            if (
              docker(
                "inspect",
                "--format",
                "{{.State.Running}}",
                name,
              ).trim() !== "true"
            )
              throw new Error(
                spawnSync("docker", ["logs", name], { encoding: "utf8" })
                  .stderr,
              );
            await new Promise((r) => setTimeout(r, 500));
          }
        }
        throw new Error("SeaweedFS failed readiness");
      };
      await ready();
      await new Promise((r) => setTimeout(r, 2000));
      assert.match(client("init"), /reconciled/);
      assert.match(client("init"), /reconciled/);
      assert.match(client("verify"), /PASS/);
      docker("restart", name);
      await ready();
      await new Promise((r) => setTimeout(r, 2000));
      assert.match(client("verify"), /PASS/);
    } finally {
      try {
        docker("rm", "-f", name);
        docker("volume", "rm", name);
        docker("network", "rm", name);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  },
);
