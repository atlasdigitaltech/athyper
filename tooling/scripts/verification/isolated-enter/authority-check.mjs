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
    const tables = Object.keys(expected);
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
    assert.deepEqual(actual, expected, "Authorization or activation changed");
    states.push(actual);
  }
  return {
    sha256: createHash("sha256").update(JSON.stringify(states)).digest("hex"),
  };
}
