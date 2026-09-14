import fs from "node:fs";
import os from "node:os";
import {
  proposal as p,
  revokeManualAccess,
  docker,
  sql,
  quote,
} from "./manual-ui-access.mjs";
const trust =
  os.homedir() +
  "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911/jwks.json";
console.log({ manualUiWatch: true, effectiveUntil: p.effectiveUntil });
while (Date.now() < Date.parse(p.effectiveUntil)) {
  const count = Number(
    sql(
      `SELECT count(*) FROM authz.group_role WHERE source_ref=${quote(p.proposalRevision)} AND status='active';`,
    ),
  );
  if (count === 0) {
    console.log({ manualUiWatchStopped: true, accessAlreadyRevoked: true });
    process.exit(0);
  }
  try {
    const cache = JSON.parse(fs.readFileSync(trust));
    if (Date.parse(cache.expiresAt) < Date.now() + 600000) {
      const jwks = JSON.parse(
        docker([
          "exec",
          "athyper-dev-source-neon-web-1",
          "node",
          "--input-type=module",
          "-e",
          "const r=await fetch('http://iam:8080/realms/athyper/protocol/openid-connect/certs');if(!r.ok)throw Error('JWKS_FETCH_FAILED');console.log(JSON.stringify(await r.json()));",
        ]),
      );
      fs.writeFileSync(
        trust,
        JSON.stringify({
          capturedAt: new Date().toISOString(),
          expiresAt: new Date(
            Math.min(Date.now() + 3600000, Date.parse(p.effectiveUntil)),
          ).toISOString(),
          jwks,
        }),
        { mode: 0o600 },
      );
      console.log({ publicKeysRefreshed: true, grantsChanged: false });
    }
  } catch {
    console.log({ publicKeyRefreshFailed: true });
  }
  await new Promise((r) =>
    setTimeout(
      r,
      Math.min(30000, Math.max(1, Date.parse(p.effectiveUntil) - Date.now())),
    ),
  );
}
console.log(revokeManualAccess("manual_walkthrough_day_ended"));
