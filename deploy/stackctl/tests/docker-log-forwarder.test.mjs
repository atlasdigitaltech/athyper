import assert from "node:assert/strict";
import test from "node:test";
import { lokiPayload, parseDockerLogLine, streamLabels } from "../src/docker-log-forwarder.mjs";

test("Docker log lines become bounded Loki streams with mandatory labels", () => {
  const parsed = parseDockerLogLine("2026-08-22T01:02:03.123456789Z request complete");
  assert.equal(parsed.timestampNs, "1787360523123000000");
  assert.equal(parsed.line, "request complete");
  const labels = streamLabels({ name: "athyper-dev-api-1", service: "api" }, "stdout", {
    environment: "development", instance: "dev", sourceRevision: "a".repeat(40),
  });
  assert.deepEqual(labels, {
    environment: "development", instance: "dev", service: "api",
    container: "athyper-dev-api-1", stream: "stdout", source_revision: "a".repeat(40),
  });
  const payload = lokiPayload([{ ...parsed, labels }, { ...parsed, line: "second", labels }]);
  assert.equal(payload.streams.length, 1);
  assert.equal(payload.streams[0].values.length, 2);
});
