import assert from "node:assert/strict";
import test from "node:test";
import {
  lokiPayload,
  parseDockerLogLine,
  retainNewest,
  streamLabels,
  managedProjects,
  readLogSources,
} from "../src/docker-log-forwarder.mjs";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("Docker log lines become bounded Loki streams with mandatory labels", () => {
  const parsed = parseDockerLogLine(
    "2026-08-22T01:02:03.123456789Z request complete",
  );
  assert.equal(parsed.timestampNs, "1787360523123000000");
  assert.equal(parsed.line, "request complete");
  const labels = streamLabels(
    { name: "athyper-dev-api-1", service: "api" },
    "stdout",
    {
      environment: "development",
      instance: "dev",
      sourceRevision: "a".repeat(40),
    },
  );
  assert.deepEqual(labels, {
    environment: "development",
    instance: "dev",
    service: "api",
    container: "athyper-dev-api-1",
    stream: "stdout",
    source_revision: "a".repeat(40),
  });
  const payload = lokiPayload([
    { ...parsed, labels },
    { ...parsed, line: "second", labels },
  ]);
  assert.equal(payload.streams.length, 1);
  assert.equal(payload.streams[0].values.length, 2);
});

test("queue overflow preserves the newest log entries", () => {
  const entries = ["oldest-retry", "older-retry", "new-1", "new-2"];
  retainNewest(entries, 2);
  assert.deepEqual(entries, ["new-1", "new-2"]);
});

test("only allowlisted running receipts grant collection, with instance-specific revisions", () => {
  const root = mkdtempSync(join(tmpdir(), "log-receipts-"));
  try {
    const file = join(root, "sources.json");
    writeFileSync(
      file,
      JSON.stringify({
        instances: [
          { instance: "dev", environment: "development" },
          { instance: "qa", environment: "testing" },
        ],
      }),
    );
    const receipt = (instance, state, project) => {
      const dir = join(root, "instances", instance, "receipts");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "active.json"),
        JSON.stringify({
          kind: "ActiveInstanceReceipt",
          metadata: { instance },
          spec: { state, project, sourceRevision: instance + "-revision" },
        }),
      );
    };
    receipt("dev", "running", "dev-replacement");
    receipt("qa", "stopped", "qa-project");
    receipt("stg", "running", "not-allowlisted");
    const sources = readLogSources(file);
    assert.deepEqual(
      managedProjects(root, sources).map((p) => p.project),
      ["dev-replacement"],
    );
    receipt("qa", "running", "qa-replacement");
    assert.deepEqual(
      managedProjects(root, sources).map((p) => p.project),
      ["dev-replacement", "qa-replacement"],
    );
    const qa = managedProjects(root, sources)[1];
    assert.equal(
      streamLabels({ name: "qa-api", service: "api", labels: qa }, "stdout", {})
        .source_revision,
      "qa-revision",
    );
    assert.equal(managedProjects(root, []).length, 0);
    writeFileSync(
      file,
      JSON.stringify({
        instances: [{ instance: "dev", environment: "production" }],
      }),
    );
    assert.throws(() => readLogSources(file), /non-production/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
