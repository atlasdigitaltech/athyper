#!/usr/bin/env node
/** Authenticated local successor transport. It reads the private current session
 * itself; credentials and tokens are never command arguments or output. */
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const [entityId, requestId, ...extra] = process.argv.slice(2);
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
if (!uuid.test(entityId ?? "") || !uuid.test(requestId ?? "") || extra.length)
  throw Error("Usage: prepare-entity-successor.mjs <entity UUID> <request UUID>");

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
  `https://api.dev.athyper.test/api/platform-control/meta-entity-authoring/entities/${entityId}/local-successor`,
  {
    method: "POST",
    signal: AbortSignal.timeout(30000),
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      "content-type": "application/json",
      "x-plane": "studio",
    },
    body: JSON.stringify({ requestId }),
  },
);
console.log(JSON.stringify({ status: response.status, result: await response.json() }));
if (!response.ok) process.exitCode = 1;
