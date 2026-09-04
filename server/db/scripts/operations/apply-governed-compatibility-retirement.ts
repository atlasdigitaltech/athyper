#!/usr/bin/env tsx
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { Client } from "pg";
import {
  sha256,
  stable,
  validateApprovalPacket,
  type ApprovalPacket,
} from "./governed-compatibility-approval.js";

const root = resolve(import.meta.dirname, "../../../.."),
  args = new Map(
    process.argv.slice(2).map((value) => {
      const [key, ...rest] = value.split("=");
      return [key, rest.join("=") || "true"];
    }),
  ),
  surfaceCode = args.get("--surface"),
  targetKind = args.get("--target"),
  packetPath = args.get("--approval-packet"),
  databaseUrl = args.get("--database-url"),
  expectedIdentity = args.get("--expected-database-identity-sha256"),
  output = args.get("--output");
const inside = (value: string) => {
  const path = resolve(root, value);
  if (path !== root && !path.startsWith(root + sep))
    throw new Error("path escapes repository");
  return path;
};
if (
  !surfaceCode ||
  !targetKind ||
  !packetPath ||
  !output ||
  !new Set(["production", "clean", "supported_upgrade"]).has(targetKind)
)
  throw new Error(
    "--surface, --target=production|clean|supported_upgrade, --approval-packet and --output are required",
  );
const sequence = JSON.parse(
    await readFile(
      resolve(
        root,
        "config/governance/governed-lifecycle-g6-retirement-sequence.v1.json",
      ),
      "utf8",
    ),
  ) as {
    state: { certifiedThroughOrder: number; nextSurface: string };
    surfaces: Array<{
      order: number;
      code: string;
      migrationKind: string;
      migration: string;
    }>;
  },
  entry = sequence.surfaces.find((value) => value.code === surfaceCode);
if (
  !entry ||
  entry.order !== sequence.state.certifiedThroughOrder + 1 ||
  sequence.state.nextSurface !== surfaceCode
)
  throw new Error(
    "surface is absent, skipped, batched, or out of retirement order",
  );
const packet = JSON.parse(
    await readFile(inside(packetPath), "utf8"),
  ) as ApprovalPacket,
  packetErrors = validateApprovalPacket(packet, surfaceCode);
if (packetErrors.length) throw new Error(packetErrors.join("; "));
const migrationBytes = await readFile(inside(entry.migration)),
  migrationHash = sha256(migrationBytes),
  migrationEvidence = packet.evidence.find(
    (value) => value.code === "retirement_candidate",
  );
if (
  migrationEvidence?.sha256 !== migrationHash ||
  migrationEvidence.source !== entry.migration
)
  throw new Error(
    "signed packet does not authorize this exact surface migration",
  );
const confirmation = `APPLY-G6-RETIREMENT:${surfaceCode}:${packet.packetHash}:${migrationHash}`;
if (args.get("--confirm") !== confirmation)
  throw new Error(`execution requires --confirm=${confirmation}`);
const startedAt = new Date().toISOString();
let databaseIdentity: null | {
    databaseName: string;
    plane: string;
    databaseOid: string;
    systemIdentifier: string;
    sha256: string;
  } = null,
  negativeProbe = false,
  transactionDisposition = "not_started";
if (entry.migrationKind === "repository_change") {
  const inventory = resolve(
    root,
    "docs/architecture/plans/governed-entity-lifecycle-implementation-inventory.md",
  );
  try {
    await readFile(inventory);
    throw new Error(
      "temporary implementation inventory still exists in the release commit",
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("still exists"))
      throw error;
  }
  transactionDisposition = "repository_change_verified";
  negativeProbe = true;
} else {
  if (
    !databaseUrl ||
    !expectedIdentity ||
    !/^[a-f0-9]{64}$/u.test(expectedIdentity)
  )
    throw new Error(
      "SQL retirement requires database URL and expected database identity SHA-256",
    );
  const client = new Client({
    connectionString: databaseUrl,
    application_name: `g6-retire-${surfaceCode}`,
  });
  await client.connect();
  try {
    const row = (
        await client.query(
          `SELECT current_database() "databaseName",current_setting('app.database_plane',true) plane,(SELECT oid::text FROM pg_database WHERE datname=current_database()) "databaseOid",(pg_control_system()).system_identifier::text "systemIdentifier"`,
        )
      ).rows[0],
      identityHash = sha256(stable(row));
    databaseIdentity = { ...row, sha256: identityHash };
    if (
      row.databaseName !== "athyper_neon" ||
      row.plane !== "neon" ||
      identityHash !== expectedIdentity
    )
      throw new Error(
        "connected database does not match the authorized NEON target identity",
      );
    if (targetKind === "production") {
      const observationRef = packet.evidence.find(
        (value) => value.code === "production_observation",
      );
      if (!observationRef?.subjectEvidenceHash)
        throw new Error("packet lacks production observation binding");
      const ledger = JSON.parse(
          await readFile(inside(observationRef.source), "utf8"),
        ),
        observation = ledger.observations
          ?.filter(
            (value: { surfaceCode: string }) =>
              value.surfaceCode === surfaceCode,
          )
          .sort(
            (a: { windowEnd: string }, b: { windowEnd: string }) =>
              Date.parse(a.windowEnd) - Date.parse(b.windowEnd),
          )
          .at(-1);
      if (
        observation?.evidence?.database?.identity?.sha256 !==
          expectedIdentity ||
        observation?.evidenceHash !== observationRef.subjectEvidenceHash
      )
        throw new Error(
          "production target differs from the signed final observation",
        );
    }
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='15min'");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`athyper:g6-retirement:${surfaceCode}`],
      );
      await client.query(migrationBytes.toString("utf8"));
      negativeProbe = await absent(client, surfaceCode);
      if (!negativeProbe)
        throw new Error(
          "post-migration negative probe found the retired surface",
        );
      await client.query("COMMIT");
      transactionDisposition = "committed";
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      transactionDisposition = "rolled_back";
      throw error;
    }
  } finally {
    await client.end();
  }
}
const receipt = {
    schemaVersion: 1,
    kind: "athyper.g6-surface-retirement-application",
    surfaceCode,
    order: entry.order,
    target: targetKind,
    startedAt,
    completedAt: new Date().toISOString(),
    approvalPacketHash: packet.packetHash,
    migration: { path: entry.migration, sha256: migrationHash },
    databaseIdentity,
    locking: {
      advisoryTransactionLock: true,
      lockTimeout: "5s",
      statementTimeout: "15min",
    },
    transactionDisposition,
    negativeProbe,
    result:
      negativeProbe &&
      ["committed", "repository_change_verified"].includes(
        transactionDisposition,
      )
        ? "passed"
        : "failed",
  },
  receiptHash = sha256(stable(receipt)),
  document = { ...receipt, receiptHash };
const destination = inside(output);
if (
  !destination.startsWith(
    resolve(root, "docs/architecture/reports/g6/retirements") + sep,
  )
)
  throw new Error(
    "receipt must be under docs/architecture/reports/g6/retirements",
  );
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(document, null, 2)}\n`, {
  flag: "wx",
  mode: 0o600,
});
process.stdout.write(
  `G6_SURFACE_RETIREMENT_APPLIED surface=${surfaceCode} target=${targetKind} receiptHash=${receiptHash}\n`,
);

async function absent(client: Client, code: string) {
  const checks: Record<string, string> = {
    business_partner_aliases_cache: `SELECT NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='master' AND table_name='business_partner' AND column_name='aliases') passed`,
    flattened_decision_scope: `SELECT NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='control' AND column_name IN('operating_organization_id','company_code_id','commodity_capability_id','commodity_category_id') AND table_name IN('business_partner_qualification','supplier_preference_designation','customer_account_designation','customer_credit_review')) passed`,
    business_partner_person_group_compatibility: `SELECT to_regclass('master.person_business_partner_legacy_link') IS NULL AND NOT EXISTS(SELECT 1 FROM master.business_partner WHERE partner_category<>'organization') passed`,
    workforce_iam_projection: `SELECT to_regclass('document.workforce_iam_projection') IS NULL AND to_regprocedure('document.command_workforce_iam_projection(uuid,uuid,bigint,text,uuid,uuid)') IS NULL passed`,
    business_partner_request_family: `SELECT to_regclass('document.business_partner_request') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='document' AND c.relname LIKE 'business_partner_request_%') passed`,
  };
  const query = checks[code];
  if (!query) throw new Error("surface has no SQL negative probe");
  return Boolean((await client.query(query)).rows[0]?.passed);
}
