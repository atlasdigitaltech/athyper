#!/usr/bin/env node

import { fileURLToPath } from "node:url";

const COMMON = Object.freeze([
  "PLAYWRIGHT_BP_V1_OPERATING_ORGANIZATION_ID",
  "PLAYWRIGHT_BP_V1_REQUESTER_USER",
  "PLAYWRIGHT_BP_V1_REQUESTER_PASSWORD",
  "PLAYWRIGHT_BP_V1_APPROVER_USER",
  "PLAYWRIGHT_BP_V1_APPROVER_PASSWORD",
  "PLAYWRIGHT_BP_V1_MATERIALIZER_USER",
  "PLAYWRIGHT_BP_V1_MATERIALIZER_PASSWORD",
]);

const REQUIRED = Object.freeze({
  v1: COMMON,
  r2: Object.freeze([
    ...COMMON,
    "PLAYWRIGHT_BP_R2_SUPPLIER_EXTENSION_TARGET_ID",
    "PLAYWRIGHT_BP_R2_CUSTOMER_TO_DUAL_TARGET_ID",
    "PLAYWRIGHT_BP_R2_CUSTOMER_EXTENSION_TARGET_ID",
    "PLAYWRIGHT_BP_R2_SUPPLIER_TO_DUAL_TARGET_ID",
  ]),
  r3: Object.freeze([
    ...COMMON,
    "PLAYWRIGHT_BP_R3_APPLICANT_USER",
    "PLAYWRIGHT_BP_R3_APPLICANT_PASSWORD",
    "PLAYWRIGHT_BP_R3_INVITATION_TOKEN",
    "PLAYWRIGHT_BP_R3_INVITEE_EMAIL",
    "PLAYWRIGHT_BP_R3_OTHER_REQUEST_ID",
    "PLAYWRIGHT_BP_R3_MESH_SNAPSHOT_ID",
  ]),
  r5: Object.freeze([
    ...COMMON,
    "PLAYWRIGHT_BP_R5_CUSTOMER_BUSINESS_PARTNER_ID",
    "PLAYWRIGHT_BP_R5_CUSTOMER_ID",
    "PLAYWRIGHT_BP_R5_COMPANY_CODE_ID",
  ]),
  "r6-amendment": Object.freeze([...COMMON,"PLAYWRIGHT_NEON_BASE_URL","PLAYWRIGHT_BP_R6_CHANGE_SNAPSHOT_ID","PLAYWRIGHT_BP_R6_CHANGE_PARTNER_ID"]),
  r6: Object.freeze([
    "PLAYWRIGHT_MESH_BASE_URL",
    "PLAYWRIGHT_BP_R6_SUPPLIER_USER",
    "PLAYWRIGHT_BP_R6_SUPPLIER_PASSWORD",
    "PLAYWRIGHT_BP_R6_BUYER_USER",
    "PLAYWRIGHT_BP_R6_BUYER_PASSWORD",
    "PLAYWRIGHT_BP_R6_BUYER_ACCOUNT_ID",
  ]),
  r7: Object.freeze([
    ...COMMON,
    "PLAYWRIGHT_BP_R7_REQUISITION_ID",
    "PLAYWRIGHT_BP_R7_SUPPLIER_ID",
    "PLAYWRIGHT_BP_R7_REQUISITION_VERSION",
    "PLAYWRIGHT_BP_R7_ENGAGEMENT_ID",
    "PLAYWRIGHT_BP_R7_ENGAGEMENT_VERSION",
    "PLAYWRIGHT_BP_R7_COMPANY_CODE_ID",
    "PLAYWRIGHT_BP_R7_PLACEMENT_EFFECTIVE_FROM",
  ]),
});

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function inspectBusinessPartnerEnvironment(
  slice,
  environment = process.env,
) {
  if (!(slice in REQUIRED))
    throw new Error("slice must be v1, r2, r3, r5, r6, r6-amendment, or r7");
  const missing = REQUIRED[slice].filter((name) => !environment[name]?.trim());
  const invalid = [];
  const present = (name) => Boolean(environment[name]?.trim());

  const uuidNames = ["PLAYWRIGHT_BP_V1_OPERATING_ORGANIZATION_ID"];
  if (slice === "r2") uuidNames.push(...REQUIRED.r2.slice(COMMON.length));
  if (slice === "r3")
    uuidNames.push(
      "PLAYWRIGHT_BP_R3_OTHER_REQUEST_ID",
      "PLAYWRIGHT_BP_R3_MESH_SNAPSHOT_ID",
    );
  if (slice === "r5") uuidNames.push(...REQUIRED.r5.slice(COMMON.length));
  if (slice === "r6-amendment") uuidNames.push("PLAYWRIGHT_BP_R6_CHANGE_SNAPSHOT_ID","PLAYWRIGHT_BP_R6_CHANGE_PARTNER_ID");
  if (slice === "r6") uuidNames.push("PLAYWRIGHT_BP_R6_BUYER_ACCOUNT_ID");
  if (slice === "r7")
    uuidNames.push(
      "PLAYWRIGHT_BP_R7_REQUISITION_ID",
      "PLAYWRIGHT_BP_R7_SUPPLIER_ID",
      "PLAYWRIGHT_BP_R7_ENGAGEMENT_ID",
      "PLAYWRIGHT_BP_R7_COMPANY_CODE_ID",
    );
  for (const name of uuidNames)
    if (present(name) && !UUID.test(environment[name].trim()))
      invalid.push(name);

  const actorNames =
    slice === "r6"
      ? ["PLAYWRIGHT_BP_R6_SUPPLIER_USER", "PLAYWRIGHT_BP_R6_BUYER_USER"]
      : [
          "PLAYWRIGHT_BP_V1_REQUESTER_USER",
          "PLAYWRIGHT_BP_V1_APPROVER_USER",
          "PLAYWRIGHT_BP_V1_MATERIALIZER_USER",
          ...(slice === "r3" ? ["PLAYWRIGHT_BP_R3_APPLICANT_USER"] : []),
        ];
  if (
    actorNames.every(present) &&
    new Set(actorNames.map((name) => environment[name].trim())).size !==
      actorNames.length
  )
    invalid.push("distinct_actor_users");

  if (slice === "r2") {
    const targets = REQUIRED.r2.slice(COMMON.length);
    if (
      targets.every(present) &&
      new Set(targets.map((name) => environment[name].trim())).size !==
        targets.length
    )
      invalid.push("distinct_r2_targets");
  }
  if (
    slice === "r7" &&
    present("PLAYWRIGHT_BP_R7_REQUISITION_VERSION") &&
    (!Number.isSafeInteger(
      Number(environment.PLAYWRIGHT_BP_R7_REQUISITION_VERSION),
    ) ||
      Number(environment.PLAYWRIGHT_BP_R7_REQUISITION_VERSION) < 1)
  )
    invalid.push("PLAYWRIGHT_BP_R7_REQUISITION_VERSION");
  if (
    slice === "r7" &&
    present("PLAYWRIGHT_BP_R7_ENGAGEMENT_VERSION") &&
    (!Number.isSafeInteger(
      Number(environment.PLAYWRIGHT_BP_R7_ENGAGEMENT_VERSION),
    ) ||
      Number(environment.PLAYWRIGHT_BP_R7_ENGAGEMENT_VERSION) < 1)
  )
    invalid.push("PLAYWRIGHT_BP_R7_ENGAGEMENT_VERSION");
  if (
    slice === "r7" &&
    present("PLAYWRIGHT_BP_R7_PLACEMENT_EFFECTIVE_FROM") &&
    !/^\d{4}-\d{2}-\d{2}$/.test(
      environment.PLAYWRIGHT_BP_R7_PLACEMENT_EFFECTIVE_FROM.trim(),
    )
  )
    invalid.push("PLAYWRIGHT_BP_R7_PLACEMENT_EFFECTIVE_FROM");

  return Object.freeze({
    schema: "athyper.business-partner-browser-environment-preflight/1",
    slice,
    ready: missing.length === 0 && invalid.length === 0,
    missing: Object.freeze(missing),
    invalid: Object.freeze(invalid),
  });
}

function selectedSlice(args) {
  const value = args.find((item) => item.startsWith("--slice="))?.slice(8);
  if (!["v1", "r2", "r3", "r5", "r6", "r6-amendment", "r7"].includes(value))
    throw new Error(
      "pass --slice=v1, --slice=r2, --slice=r3, --slice=r5, --slice=r6, --slice=r6-amendment, or --slice=r7",
    );
  return value;
}

function main() {
  const result = inspectBusinessPartnerEnvironment(
    selectedSlice(process.argv.slice(2)),
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ready) process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main();
