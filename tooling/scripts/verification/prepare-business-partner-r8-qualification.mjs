#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  R8_GATES,
  R8_OWNERS,
  R8_ACCESSIBILITY_CHECKS,
  isReference,
} from "./business-partner-r8-evidence.mjs";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const required = Object.freeze([
  "ENVIRONMENT",
  "R8_TARGET_REF",
  "R8_SOURCE_REVISION",
  "R8_UPGRADE_BASELINE_REF",
  "R8_EVIDENCE_LOCATION_REF",
  "CLEAN_DATABASE_URL",
  "UPGRADE_DATABASE_URL",
  "PUBLICATION_CANARY_API_URL",
  "PUBLICATION_CANARY_BEARER_TOKEN",
  "PUBLICATION_CANARY_RELEASE_ID",
  "PUBLICATION_CANARY_PUBLICATION_KEY",
  "PUBLICATION_CANARY_TENANT_ID",
  "STUDIO_DATABASE_URL",
  "NEON_DATABASE_URL",
  "MESH_DATABASE_URL",
  "R8_ACCESSIBILITY_REVIEWER",
  ...R8_OWNERS.map((role) => `R8_${role.toUpperCase()}`),
]);
export function inspectR8Environment(env = process.env) {
  const missing = required.filter((key) => !env[key]?.trim()),
    invalid = [];
  if (env.ENVIRONMENT && env.ENVIRONMENT !== "production")
    invalid.push("ENVIRONMENT");
  for (const key of [
    "R8_TARGET_REF",
    "R8_UPGRADE_BASELINE_REF",
    "R8_EVIDENCE_LOCATION_REF",
  ])
    if (env[key] && !isReference(env[key])) invalid.push(key);
  if (env.R8_SOURCE_REVISION && !/^[a-f0-9]{40}$/.test(env.R8_SOURCE_REVISION))
    invalid.push("R8_SOURCE_REVISION");
  for (const key of [
    "PUBLICATION_CANARY_RELEASE_ID",
    "PUBLICATION_CANARY_TENANT_ID",
  ])
    if (
      env[key] &&
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        env[key],
      )
    )
      invalid.push(key);
  if (env.PUBLICATION_CANARY_API_URL) {
    try {
      const url = new URL(env.PUBLICATION_CANARY_API_URL);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        invalid.push("PUBLICATION_CANARY_API_URL");
    } catch {
      invalid.push("PUBLICATION_CANARY_API_URL");
    }
  }
  const databaseNames = [
    "CLEAN_DATABASE_URL",
    "UPGRADE_DATABASE_URL",
    "STUDIO_DATABASE_URL",
    "NEON_DATABASE_URL",
    "MESH_DATABASE_URL",
  ];
  for (const key of databaseNames)
    if (env[key]) {
      try {
        if (!["postgres:", "postgresql:"].includes(new URL(env[key]).protocol))
          invalid.push(key);
      } catch {
        invalid.push(key);
      }
    }
  if (
    env.CLEAN_DATABASE_URL &&
    env.CLEAN_DATABASE_URL === env.UPGRADE_DATABASE_URL
  )
    invalid.push("distinct_clean_upgrade_databases");
  const owners = R8_OWNERS.map((role) =>
    env[`R8_${role.toUpperCase()}`]?.trim().toLowerCase(),
  ).filter(Boolean);
  if (new Set(owners).size !== owners.length)
    invalid.push("distinct_named_owners");
  return {
    schema: "athyper.business-partner-r8-preflight/1",
    ready: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
    note: "Configuration presence only; target identity, access, deployed revision, retention and human approvals require evidence.",
  };
}
export function createR8ReviewDrafts() {
  const evidence = {
    target_evidence_lifecycle: {
      immutable: null,
      locationRef: null,
      retainedUntil: null,
      objectVersionRef: null,
      retentionAttestationRef: null,
      retentionMode: null,
      retentionVerified: null,
    },
    manual_accessibility: {
      standard: "WCAG 2.2 AA",
      zoomPercent: 200,
      viewports: ["1440x900", "412x915"],
      assistiveTechnologies: [],
      reviewer: { name: null, role: "accessibility_specialist" },
      reviewAttestationRef: null,
      checks: R8_ACCESSIBILITY_CHECKS.map((id) => ({
        id,
        result: "pending",
        evidenceRef: null,
      })),
    },
    clean_upgrade_parity: {
      driftCount: null,
      cleanDatabaseRef: null,
      upgradeDatabaseRef: null,
      supportedUpgradeBaselineRef: null,
      catalogReport: null,
    },
    production_canary_rollback: {
      planes: ["studio", "neon", "mesh"],
      exactPriorHeadsRestored: null,
      correlationIds: [],
      canaryReport: null,
    },
    named_owner_certification: {
      reviewedReceipts: Object.fromEntries(
        R8_GATES.slice(0, 4).map((id) => [id, null]),
      ),
      certifications: R8_OWNERS.map((role) => ({
        role,
        name: null,
        signedAt: null,
        approvalRef: null,
      })),
    },
  };
  return Object.fromEntries(
    R8_GATES.map((gate) => [
      gate,
      {
        schema: "athyper.business-partner-r8-evidence-artifact/1",
        gate,
        result: "pending",
        environment: "production",
        targetRef: null,
        sourceRevision: null,
        startedAt: null,
        completedAt: null,
        evidence: evidence[gate],
      },
    ]),
  );
}
export function prepareR8Packet({
  repositoryRoot = root,
  packetId,
  env = process.env,
  now = new Date().toISOString(),
}) {
  if (!packetId || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(packetId))
    throw new Error("A lowercase packet ID is required");
  const directory = resolve(
    repositoryRoot,
    "governance/evidence/business-partner/r8/packets",
    packetId,
  );
  mkdirSync(directory, { recursive: true });
  const preflight = inspectR8Environment(env);
  const drafts = createR8ReviewDrafts();
  const packet = {
    schema: "athyper.business-partner-r8-execution-packet/1",
    createdAt: now,
    status: "prepared",
    productionQualified: false,
    preflight,
    gates: R8_GATES.map((gate) => ({
      gate,
      status: "pending",
      draft: `${gate}.draft.json`,
    })),
    instructions:
      "Complete drafts from actual target/human evidence, then use record:business-partner-r8. Drafts cannot qualify a gate.",
  };
  // Refuse to replace an existing review packet or reviewer edits.
  writeFileSync(
    resolve(directory, "packet.json"),
    JSON.stringify(packet, null, 2) + "\n",
    { flag: "wx" },
  );
  for (const [gate, draft] of Object.entries(drafts))
    writeFileSync(
      resolve(directory, `${gate}.draft.json`),
      JSON.stringify(draft, null, 2) + "\n",
      { flag: "wx" },
    );
  return { directory, packet };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.includes("--preflight")) {
    const result = inspectR8Environment();
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (!result.ready) process.exitCode = 2;
  } else {
    const packetId = args
      .find((value) => value.startsWith("--packet="))
      ?.slice(9);
    const result = prepareR8Packet({ packetId });
    process.stdout.write(
      `R8 packet prepared: ${result.directory}\nProduction gates remain pending.\n`,
    );
  }
}
