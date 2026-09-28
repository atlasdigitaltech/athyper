#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Uses the authenticated API. Never writes policy/grant/activation tables or
 * mints tokens. Propose and activate must be run by separate real identities. */
export async function main(args = process.argv.slice(2)) {
  const allowed = new Set(["phase", "base-url", "document", "bearer-token-file", "confirm"]);
  const entries = args.map(argument => {
    const match = /^--([^=]+)=(.+)$/.exec(argument);
    if (!match || !allowed.has(match[1])) throw Error("Unsupported enrollment argument");
    return [match[1], match[2]];
  });
  const options = Object.fromEntries(entries);
  if (entries.length !== Object.keys(options).length || !["propose", "activate"].includes(options.phase)
    || options.confirm !== "DEV-PUBLICATION-POLICY-ENROLLMENT")
    throw Error("Specify --phase=propose|activate and --confirm=DEV-PUBLICATION-POLICY-ENROLLMENT");
  const base = new URL(options["base-url"]);
  if (base.protocol !== "https:" || !["api.dev.athyper.test", "studio.dev.athyper.test"].includes(base.hostname)
    || base.port || base.username || base.password || base.pathname !== "/" || base.search || base.hash)
    throw Error("An exact HTTPS DEV API origin is required");
  const file = options["bearer-token-file"];
  const stat = statSync(file);
  if (!stat.isFile() || stat.size > 32768 || (stat.mode & 0o077)) throw Error("Bearer token file must be private (0600)");
  const token = readFileSync(file, "utf8").trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(token)) throw Error("Invalid bearer token file");
  const documentPath = options.document;
  if (statSync(documentPath).size > 32768) throw Error("Enrollment document is too large");
  const document = JSON.parse(readFileSync(documentPath, "utf8"));
  let path = "/api/studio/publication-policies", body = document;
  if (options.phase === "activate") {
    if (!/^[a-f0-9-]{36}$/.test(document.id) || !/^[a-f0-9]{64}$/.test(document.hash)) throw Error("A persisted policy pin is required");
    path += `/${document.id}/activate`;
    body = { expectedHash: document.hash };
  }
  const response = await fetch(new URL(path, base), {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-plane": "studio" }, body: JSON.stringify(body),
  });
  if (!response.ok) throw Error(`Enrollment rejected (HTTP ${response.status}); inspect the authenticated API audit/error log`);
  const pin = await response.json();
  if (!/^[a-f0-9-]{36}$/.test(pin.id) || !/^[a-f0-9]{64}$/.test(pin.hash)
    || !Number.isSafeInteger(pin.version) || pin.version < 1
    || pin.status !== (options.phase === "propose" ? "pending_approval" : "active")) throw Error("Unexpected enrollment response");
  // Receipt coordinates only; never output tokens or the submitted policy.
  process.stdout.write(JSON.stringify({ id: pin.id, version: pin.version, hash: pin.hash, status: pin.status }) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(error => { console.error(error instanceof Error ? error.message : "Enrollment failed"); process.exitCode = 1; });
