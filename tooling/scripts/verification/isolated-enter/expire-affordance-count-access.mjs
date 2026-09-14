import { run } from "./affordance-count-run.mjs";
import fs from "node:fs";
import { proposal, revoke } from "./affordance-count-client.mjs";
const delay = Math.max(0, Date.parse(proposal.effectiveUntil) - Date.now());
console.log({
  expiryWatcher: true,
  effectiveUntil: proposal.effectiveUntil,
  proposalRevision: proposal.proposalRevision,
});
await new Promise((resolve) => setTimeout(resolve, delay));
const result = revoke(proposal.batches, "approved_window_expired");
fs.writeFileSync(
  `governance/policy/reports/business-partner-affordance-count-expiry-${run}.dev.json`,
  JSON.stringify(result, null, 2) + "\n",
  { flag: "wx" },
);
console.log({ expired: true });
