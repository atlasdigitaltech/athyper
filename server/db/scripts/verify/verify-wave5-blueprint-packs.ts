import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const db = resolve(root, "server/db");
const packsRoot = resolve(db, "seed-packs/blueprints-v2");
const sha = (value: string) => createHash("sha256").update(value.replace(/\r\n?/g, "\n")).digest("hex");

async function main() {
  const ledger = JSON.parse(await readFile(resolve(packsRoot, "pack-ledger.v1.json"), "utf8"));
  const failures: string[] = [];
  const codes = new Set(ledger.packs.map((p: any) => p.packCode));
  let previous = -1;
  for (const row of ledger.packs) {
    if (row.executionOrder <= previous) failures.push(`${row.packCode}: execution order is not strictly increasing`);
    previous = row.executionOrder;
    for (const dependency of row.dependencies) if (!codes.has(dependency)) failures.push(`${row.packCode}: unknown dependency ${dependency}`);
    const dir = `${String(row.executionOrder).padStart(3, "0")}-${row.packCode}`;
    const pack = JSON.parse(await readFile(resolve(packsRoot, dir, "pack.v1.json"), "utf8"));
    const expectedScope = row.packCode === "bank-formats"
      ? { plane: "athyper", tenantScope: "global" }
      : row.packCode === "party-risk-defaults"
        ? { plane: "neon", tenantScope: "none" }
        : { plane: "neon", tenantScope: "tenant" };
    if (pack.plane !== expectedScope.plane || pack.tenantScope !== expectedScope.tenantScope) failures.push(`${row.packCode}: invalid plane or tenant scope`);
    if (pack.compatibleDdl?.layers !== "02-11") failures.push(`${row.packCode}: missing DDL compatibility`);
    const payloadHashes: string[] = [];
    for (const payload of pack.payloads) {
      const content = await readFile(resolve(root, payload.path), "utf8").catch(() => "");
      if (!content) failures.push(`${row.packCode}: missing payload ${payload.path}`);
      const digest = sha(content); payloadHashes.push(`${payload.path}:${digest}`);
      if (digest !== payload.sha256) failures.push(`${row.packCode}: payload checksum mismatch ${payload.path}`);
      if (payload.path.endsWith("005_accounting_profile_ddl.sql")) failures.push("AP Non-PO DDL payload remains in pack");
    }
    if (sha(payloadHashes.join("\n")) !== pack.checksum) failures.push(`${row.packCode}: pack checksum mismatch`);
    const receipt = JSON.parse(await readFile(resolve(root, pack.applicationReceipt.receiptPath), "utf8"));
    if (receipt.packChecksum !== pack.checksum) failures.push(`${row.packCode}: receipt checksum mismatch`);
    const blocked = pack.payloads.some((p: any) => p.permanentDdl || p.requiredRewrites.length);
    if (blocked !== pack.applicationReceipt.status.startsWith("blocked")) failures.push(`${row.packCode}: rewrite gate status is inconsistent`);
  }
  const apFiles = await readdir(resolve(db, "seed/blueprints/modules/ap_non_po"));
  if (apFiles.includes("005_accounting_profile_ddl.sql")) failures.push("005_accounting_profile_ddl.sql was not removed");
  const ddl = await readFile(resolve(db, "ddl/planes/neon/master/03_tables.sql"), "utf8");
  const policyDdl = await readFile(resolve(db, "ddl/planes/neon/control/03_accounting_policy_tables.sql"), "utf8");
  if (!/CREATE TABLE master\.accounting_profile/.test(ddl) || !/CREATE TABLE control\.accounting_profile_policy/.test(policyDdl)) failures.push("accounting policy structure is missing from DDL layers");
  if (failures.length) throw new Error(`Wave 5 verification failed:\n- ${failures.join("\n- ")}`);
  console.log(`Wave 5 blueprint framework verified: ${ledger.packs.length} ordered packs, checksums and receipts current; AP Non-PO DDL removed.`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
