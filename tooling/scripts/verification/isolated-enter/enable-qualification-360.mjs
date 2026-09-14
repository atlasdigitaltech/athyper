import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { assertAuthorityUnchanged } from "./dependency-authority-check.mjs";
const run = (input) =>
  cp
    .execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "athyper-bp-enter-db",
        "psql",
        "-X",
        "-qAt",
        "-U",
        "postgres",
        "-d",
        "athyper_neon",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    )
    .trim();
const query =
  "SELECT row_to_json(f) FROM control.feature_flag_catalog f WHERE code='neon.business_partner.view_360';";
const before = JSON.parse(run(query)),
  authority = assertAuthorityUnchanged();
assert.equal(before.rollout_pct, 0);
run(
  "BEGIN;UPDATE control.feature_flag_catalog SET rollout_pct=100,updated_at=now() WHERE code='neon.business_partner.view_360' AND rollout_pct=0;COMMIT;",
);
assert.deepEqual(assertAuthorityUnchanged(), authority);
const after = JSON.parse(run(query));
assert.equal(after.rollout_pct, 100);
fs.writeFileSync(
  "governance/policy/reports/business-partner-isolated-360-feature-20260912.dev.json",
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      kind: "isolated-qualification-ui-configuration",
      before,
      after,
      authorizationAndHeadsUnchanged: true,
      sharedDevChanged: false,
      recovery:
        "Restore rollout_pct=0 in isolated clone and restart its API to clear process feature caches.",
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
