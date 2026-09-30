import fs from "node:fs";
import {
  proposal as p,
  revokeManualAccess,
  sql,
  quote,
} from "./manual-ui-access.mjs";
const receipt =
  "governance/policy/reports/business-partner-manual-ui-revocation-20260912.dev.json";
if (fs.existsSync(receipt)) {
  const active = Number(
    sql(
      `SELECT count(*) FROM authz.group_role WHERE source_ref=${quote(p.proposalRevision)} AND status='active';`,
    ),
  );
  if (active !== 0) throw Error("Unexpected active manual access");
  console.log({ alreadyRevoked: true });
} else console.log(revokeManualAccess("user_finished_manual_walkthrough"));
