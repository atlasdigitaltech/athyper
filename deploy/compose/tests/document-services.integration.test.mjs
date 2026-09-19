import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const require = createRequire(
  new URL("../../stackctl/package.json", import.meta.url),
);
const YAML = require("yaml");
const config = YAML.parse(
  readFileSync(
    new URL("../instance/compose.parity.yaml", import.meta.url),
    "utf8",
  ),
  { merge: true },
);
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    timeout: 150_000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

function xfaPdf() {
  const xml =
    '<?xml version="1.0"?><!DOCTYPE xdp:xdp [<!ENTITY probe SYSTEM "file:///tmp/xxe-marker.txt">]><xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/"><xfa:data><probe>&probe;</probe></xfa:data></xfa:datasets></xdp:xdp>';
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R /AcroForm 4 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>",
    "<< /XFA 5 0 R /Fields [] >>",
    `<< /Length ${Buffer.byteLength(xml)} >>\nstream\n${xml}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}`;
  return (
    pdf + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  );
}

test("document processors cannot directly join the database network", () => {
  assert.equal(config.networks["document-services"].internal, true);
  assert.deepEqual(config.services.virusscan.networks, [
    "document-services",
    "signature-egress",
  ]);
  assert.equal(config.services.virusscan.ports, undefined);
  for (const id of ["docrender", "docparser"]) {
    assert.deepEqual(config.services[id].networks, ["document-services"]);
    assert.equal(config.services[id].ports, undefined);
  }
  for (const id of ["api", "worker", "scheduler"]) {
    const networks = config.services[id].networks;
    assert.ok(
      (Array.isArray(networks) ? networks : Object.keys(networks)).includes(
        "document-services",
      ),
    );
  }
});

// Disposable containers only; pull the pinned images before opting in.
test(
  "pinned document images render/extract and deny unsafe conversion paths",
  {
    skip: process.env.ATHYPER_DOCUMENT_IMAGE_TESTS !== "true",
    timeout: 300_000,
  },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "document-images-"));
    const containers = [];
    try {
      for (const id of ["docrender", "docparser"]) {
        const service = config.services[id];
        const name = `audit-${id}-${randomUUID().slice(0, 8)}`;
        docker(
          "run",
          "-d",
          "--name",
          name,
          "--network",
          "none",
          "--cap-drop",
          "ALL",
          "--security-opt",
          "no-new-privileges:true",
          "--init",
          ...(service.read_only ? ["--read-only"] : []),
          ...(service.tmpfs ?? []).flatMap((mount) => ["--tmpfs", mount]),
          "--memory",
          service.mem_limit,
          "--cpus",
          String(service.cpus),
          service.image.replace(
            /\$\{([^:}]+):-([^}]+)\}/g,
            (_, key, value) => process.env[key] ?? value,
          ),
          ...(service.command ?? []),
        );
        containers.push(name);
        let ready = false;
        for (let i = 0; i < 90; i++) {
          try {
            docker("exec", name, ...service.healthcheck.test.slice(1));
            ready = true;
            break;
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
        assert.ok(ready, `${id} failed readiness: ${docker("logs", name)}`);
        if (id === "docrender") {
          writeFileSync(
            join(directory, "index.html"),
            "<html><body>Audit rendering fixture</body></html>",
          );
          execFileSync(
            "docker",
            ["exec", "-i", name, "sh", "-c", "cat > /tmp/index.html"],
            { input: readFileSync(join(directory, "index.html")) },
          );
          const pdf = docker(
            "exec",
            name,
            "curl",
            "-fsS",
            "-F",
            "files=@/tmp/index.html",
            "http://localhost:3000/forms/chromium/convert/html",
          );
          assert.ok(pdf.startsWith("%PDF-"));
          for (const url of ["file:///tmp/", "http://127.0.0.1:3000/health"]) {
            const status = docker(
              "exec",
              name,
              "curl",
              "-sS",
              "-o",
              "/dev/null",
              "-w",
              "%{http_code}",
              "-F",
              `url=${url}`,
              "http://localhost:3000/forms/chromium/convert/url",
            );
            assert.ok(
              ["400", "403"].includes(status),
              `${url} returned ${status}`,
            );
          }
          assert.equal(
            docker(
              "exec",
              name,
              "curl",
              "-sS",
              "-o",
              "/dev/null",
              "-w",
              "%{http_code}",
              "-X",
              "POST",
              "http://localhost:3000/forms/pdfengines/merge",
            ),
            "404",
          );
        } else {
          // Use wget, which is also required by this image's configured healthcheck.
          const text = docker(
            "exec",
            name,
            "wget",
            "-q",
            "-O",
            "-",
            "--method=PUT",
            "--header=Content-Type: text/plain",
            "--header=Accept: text/plain",
            "--body-data=Audit extraction fixture",
            "http://localhost:9998/tika",
          );
          assert.match(text, /Audit extraction fixture/);
          const marker = `XXE-MUST-NOT-EXTRACT-${randomUUID()}`;
          writeFileSync(join(directory, "xxe-marker.txt"), marker);
          writeFileSync(join(directory, "xfa.pdf"), xfaPdf());
          for (const file of ["xxe-marker.txt", "xfa.pdf"])
            execFileSync(
              "docker",
              [
                "exec",
                "-i",
                name,
                "sh",
                "-c",
                'cat > "$1"',
                "sh",
                `/tmp/${file}`,
              ],
              { input: readFileSync(join(directory, file)) },
            );
          const extracted = docker(
            "exec",
            name,
            "wget",
            "-q",
            "-O",
            "-",
            "--method=PUT",
            "--header=Content-Type: application/pdf",
            "--header=Accept: text/plain",
            "--body-file=/tmp/xfa.pdf",
            "http://localhost:9998/tika",
          );
          assert.ok(
            !extracted.includes(marker),
            "Tika expanded a local-file XFA entity",
          );
        }
        docker("restart", name);
        let restarted = false;
        for (let i = 0; i < 90; i++) {
          try {
            docker("exec", name, ...service.healthcheck.test.slice(1));
            restarted = true;
            break;
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
        assert.ok(restarted, `${id} failed readiness after restart`);
      }
    } catch (error) {
      for (const name of containers) {
        const logs = spawnSync("docker", ["logs", name], { encoding: "utf8" });
        console.error(logs.stdout + logs.stderr);
      }
      throw error;
    } finally {
      for (const name of containers.reverse()) docker("rm", "-f", name);
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test("document and search services keep their root filesystems read-only", () => {
  for (const id of ["virusscan", "docrender", "docparser", "searchcore"]) {
    assert.equal(config.services[id].read_only, true);
    assert.ok(config.services[id].tmpfs.includes("/tmp"));
  }
  assert.ok(config.services.virusscan.tmpfs.includes("/run"));
  assert.ok(config.services.virusscan.tmpfs.includes("/var/log/clamav"));
});
