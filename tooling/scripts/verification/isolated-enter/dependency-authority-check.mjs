import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const receipt = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-enter-access-20260912.application.dev.json",
  ),
);
export function assertAuthorityUnchanged() {
  assert.ok(
    Date.now() >= Date.parse(receipt.effectiveFrom) &&
      Date.now() < Date.parse(receipt.effectiveUntil),
    "Approved grant window closed",
  );
  const states = [];
  for (const [container, plane, expected] of [
    ["athyper-bp-enter-db", "neon", receipt.after],
    ...Object.entries(receipt.sharedAfter).map(([plane, value]) => [
      "athyper-dev-db-1",
      plane,
      value,
    ]),
  ]) {
    const tables = Object.keys(expected).filter(
      (t) =>
        !(
          container === "athyper-bp-enter-db" &&
          plane === "neon" &&
          t === "runtime_meta.release_activation_head"
        ),
    );
    const query =
      "BEGIN READ ONLY;SELECT jsonb_object_agg(name,digest) FROM (" +
      tables
        .map(
          (t) =>
            `SELECT '${t}' name,md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) digest FROM ${t} r`,
        )
        .join(" UNION ALL ") +
      ") s;ROLLBACK;";
    const actual = JSON.parse(
      cp.execFileSync(
        "docker",
        [
          "exec",
          "-i",
          container,
          "psql",
          "-X",
          "-qAt",
          "-U",
          "postgres",
          "-d",
          "athyper_" + plane,
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      ),
    );
    assert.deepEqual(
      actual,
      Object.fromEntries(tables.map((t) => [t, expected[t]])),
      "Authorization or shared activation changed",
    );
    states.push(actual);
  }
  const pins = JSON.parse(
    fs.readFileSync(
      "governance/policy/reports/business-partner-dependency-host-20260912.dev.json",
    ),
  )
    .releases.concat([
      {
        releaseId: "c2cc6900-26c1-47ca-8dfc-1d488000950c",
        artifactHash:
          "45ddc85ece1f453e84b1eccc0cea9ca141fe9847c68ab7d2500e7d347d7b75fc",
      },
    ])
    .sort((a, b) => a.releaseId.localeCompare(b.releaseId));
  const heads = JSON.parse(
    cp.execFileSync(
      "docker",
      [
        "exec",
        "athyper-bp-enter-db",
        "psql",
        "-X",
        "-qAt",
        "-U",
        "postgres",
        "-d",
        "athyper_neon",
        "-c",
        "SELECT jsonb_agg(jsonb_build_object('releaseId',a.source_release_id,'artifactHash',h.artifact_hash) ORDER BY a.source_release_id) FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id",
      ],
      { encoding: "utf8" },
    ),
  );
  assert.deepEqual(heads, pins, "Exact qualification release set changed");
  states.push(heads);
  return {
    sha256: createHash("sha256").update(JSON.stringify(states)).digest("hex"),
  };
}
