/** Read back existing DEV activation receipts; never stages or activates releases. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { artifactDirectory } from "../artifact-paths.mjs";
const container = "athyper-dev-db-1";
const probe = process.argv.includes("--probe");
const docker = (args) => execFileSync("docker", args, { encoding: "utf8" });
const info = JSON.parse(docker(["inspect", container]))[0];
assert.equal(info.Config.Labels["com.docker.compose.project"], "athyper-dev");
const output = artifactDirectory("entity-activation-dev");
mkdirSync(output, { recursive: true });
const report = {
  observedAt: new Date().toISOString(),
  environment: "dev",
  qualification: "existing-activation-readback-only",
  passed: false,
  planes: [],
};
try {
  for (const plane of ["studio", "neon", "mesh"]) {
    const query = `SELECT coalesce(json_agg(r), '[]'::json) FROM (
      SELECT h.publication_key,h.source_release_no,h.artifact_hash,h.activated_at,
        a.status,a.verified_at,a.artifact_hash=h.artifact_hash AS matching_artifact,
        a.source_release_no=h.source_release_no AS matching_release,
        p.payload_hash,p.artifact_kind,
        EXISTS (SELECT 1 FROM runtime_meta.release_activation_event e
          WHERE e.applied_release_id=a.id AND e.publication_key=h.publication_key) AS activation_event
      FROM runtime_meta.release_activation_head h
      JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id
      LEFT JOIN runtime_meta.applied_release_payload p ON p.applied_release_id=a.id
      WHERE h.publication_key IN ('metadata.reference.country','metadata.entity.principal',
        'metadata.entity.principal_profile','metadata.entity.principal_notification_preference'
        ${probe ? ", 'metadata.entity.principal_disclosure_probe'" : ""})
      ORDER BY h.publication_key) r`;
    const rows = JSON.parse(
      docker([
        "exec",
        "-e",
        "PGOPTIONS=-c default_transaction_read_only=on",
        container,
        "psql",
        "-X",
        "-U",
        "postgres",
        "-d",
        `athyper_${plane}`,
        "-Atq",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        query,
      ]),
    );
    report.planes.push({ plane, releases: rows });
    assert.equal(
      rows.length,
      probe ? 5 : 4,
      `${plane}: missing entity activation`,
    );
    for (const row of rows) {
      assert.equal(row.status, "active");
      assert.ok(row.verified_at && row.activated_at && row.payload_hash);
      assert.ok(
        row.matching_artifact && row.matching_release && row.activation_event,
      );
    }
  }
  report.passed = true;
} catch (error) {
  report.failure = error.message;
  process.exitCode = 1;
}
writeFileSync(
  join(output, "summary.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
console.log(`Evidence: ${join(output, "summary.json")}`);
