#!/usr/bin/env node
/** Existing authenticated local command transport; no credentials in arguments or output. */
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const [draft, revision, requestId, action, ...extra] = process.argv.slice(2);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
if (
  !uuid.test(draft ?? "") ||
  !uuid.test(requestId ?? "") ||
  !/^[1-9][0-9]*$/u.test(revision ?? "") ||
  !Number.isSafeInteger(Number(revision)) ||
  (action !== undefined && action !== "rollback") ||
  extra.length
) {
  throw Error(
    "Usage: request-entity-publication.mjs <draft UUID> <saved revision> <request UUID> [rollback]",
  );
}
const file = join(
  homedir(),
  ".athyper/instances/dev/secrets/control-api/login/platform.admin.json",
);
const stat = statSync(file);
if (!stat.isFile() || stat.mode & 0o077 || stat.uid !== process.getuid())
  throw Error("Private current Admin session file required");
const session = JSON.parse(readFileSync(file, "utf8"));
if (typeof session.accessToken !== "string" || !session.accessToken)
  throw Error("Current Admin sign-in required");
const response = await fetch(
  `https://api.dev.athyper.test/api/platform-control/meta-entity-authoring/change-sets/${draft}/local-publication`,
  {
    method: "POST",
    signal: AbortSignal.timeout(30000),
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      "content-type": "application/json",
      "x-plane": "studio",
    },
    body: JSON.stringify({
      requestId,
      expectedRevision: Number(revision),
      ...(action ? { action } : {}),
    }),
  },
);
console.log(
  JSON.stringify({ status: response.status, result: await response.json() }),
);
if (!response.ok) process.exitCode = 1;
