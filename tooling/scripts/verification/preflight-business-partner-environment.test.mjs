import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { inspectBusinessPartnerEnvironment } from "./preflight-business-partner-environment.mjs";

const uuid = (digit) =>
  `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const common = {
  PLAYWRIGHT_BP_V1_OPERATING_ORGANIZATION_ID: uuid("1"),
  PLAYWRIGHT_BP_V1_REQUESTER_USER: "requester",
  PLAYWRIGHT_BP_V1_REQUESTER_PASSWORD: "requester-secret",
  PLAYWRIGHT_BP_V1_APPROVER_USER: "approver",
  PLAYWRIGHT_BP_V1_APPROVER_PASSWORD: "approver-secret",
  PLAYWRIGHT_BP_V1_MATERIALIZER_USER: "materializer",
  PLAYWRIGHT_BP_V1_MATERIALIZER_PASSWORD: "materializer-secret",
};

describe("Business Partner browser environment preflight", () => {
  it("supports V1 actor validation and a secret-safe failing CLI preflight", () => {
    assert.equal(inspectBusinessPartnerEnvironment("v1", common).ready, true);
    const command = spawnSync(process.execPath, [fileURLToPath(new URL("./preflight-business-partner-environment.mjs", import.meta.url)), "--slice=v1"], {env:{},encoding:"utf8"});
    assert.equal(command.status, 2);
    assert.equal(JSON.parse(command.stdout).missing.length, 7);
    assert.equal(JSON.parse(command.stdout).slice, "v1");
  });
  it("requires amendment fixtures and independent actors through the CLI", () => {
    const env={...common,PLAYWRIGHT_NEON_BASE_URL:"https://neon.example.test",PLAYWRIGHT_BP_R6_CHANGE_SNAPSHOT_ID:uuid("2"),PLAYWRIGHT_BP_R6_CHANGE_PARTNER_ID:uuid("3")};
    assert.equal(inspectBusinessPartnerEnvironment("r6-amendment",env).ready,true);
    assert.equal(inspectBusinessPartnerEnvironment("r6-amendment",{...env,PLAYWRIGHT_BP_R6_CHANGE_SNAPSHOT_ID:"invalid"}).ready,false);
    const result=spawnSync(process.execPath,[fileURLToPath(new URL("./preflight-business-partner-environment.mjs",import.meta.url)),"--slice=r6-amendment"],{env:{},encoding:"utf8"});
    assert.equal(result.status,2);assert.equal(JSON.parse(result.stdout).missing.length,10);
    assert.equal(JSON.stringify(inspectBusinessPartnerEnvironment("r6-amendment",env)).includes("secret"),false);
  });
  it("reports every missing name without exposing values", () => {
    const result = inspectBusinessPartnerEnvironment("r3", {});
    assert.equal(result.ready, false);
    assert.equal(result.missing.length, 13);
    assert.deepEqual(result.invalid, []);
    assert.equal(JSON.stringify(result).includes("secret"), false);
  });

  it("accepts four distinct R2 targets and three distinct actors", () => {
    const result = inspectBusinessPartnerEnvironment("r2", {
      ...common,
      PLAYWRIGHT_BP_R2_SUPPLIER_EXTENSION_TARGET_ID: uuid("2"),
      PLAYWRIGHT_BP_R2_CUSTOMER_TO_DUAL_TARGET_ID: uuid("3"),
      PLAYWRIGHT_BP_R2_CUSTOMER_EXTENSION_TARGET_ID: uuid("4"),
      PLAYWRIGHT_BP_R2_SUPPLIER_TO_DUAL_TARGET_ID: uuid("5"),
    });
    assert.equal(result.ready, true);
  });

  it("rejects reused R3 actor identities", () => {
    const result = inspectBusinessPartnerEnvironment("r3", {
      ...common,
      PLAYWRIGHT_BP_R3_APPLICANT_USER: "requester",
      PLAYWRIGHT_BP_R3_APPLICANT_PASSWORD: "applicant-secret",
      PLAYWRIGHT_BP_R3_INVITATION_TOKEN: "one-time-token",
      PLAYWRIGHT_BP_R3_INVITEE_EMAIL: "applicant@example.test",
      PLAYWRIGHT_BP_R3_OTHER_REQUEST_ID: uuid("6"),
      PLAYWRIGHT_BP_R3_MESH_SNAPSHOT_ID: uuid("7"),
    });
    assert.deepEqual(result.invalid, ["distinct_actor_users"]);
  });

  it("R5 creates onboarding evidence and needs only three control fixture UUIDs", () => {
    const result = inspectBusinessPartnerEnvironment("r5", {
      ...common,
      PLAYWRIGHT_BP_R5_CUSTOMER_BUSINESS_PARTNER_ID: uuid("2"),
      PLAYWRIGHT_BP_R5_CUSTOMER_ID: uuid("3"),
      PLAYWRIGHT_BP_R5_COMPANY_CODE_ID: uuid("4"),
    });
    assert.equal(result.ready, true);
    assert.equal(inspectBusinessPartnerEnvironment("r5", {}).missing.length, 10);
  });

  it("requires valid resettable R7 publication coordinates", () => {
    const ready = inspectBusinessPartnerEnvironment("r7", {
      ...common,
      PLAYWRIGHT_BP_R7_REQUISITION_ID: uuid("2"),
      PLAYWRIGHT_BP_R7_SUPPLIER_ID: uuid("3"),
      PLAYWRIGHT_BP_R7_REQUISITION_VERSION: "4",
      PLAYWRIGHT_BP_R7_ENGAGEMENT_ID: uuid("4"),
      PLAYWRIGHT_BP_R7_ENGAGEMENT_VERSION: "2",
      PLAYWRIGHT_BP_R7_COMPANY_CODE_ID: uuid("5"),
      PLAYWRIGHT_BP_R7_PLACEMENT_EFFECTIVE_FROM: "2026-09-05",
    });
    assert.equal(ready.ready, true);
    const invalid = inspectBusinessPartnerEnvironment("r7", {
      ...common,
      PLAYWRIGHT_BP_R7_REQUISITION_ID: uuid("2"),
      PLAYWRIGHT_BP_R7_SUPPLIER_ID: uuid("3"),
      PLAYWRIGHT_BP_R7_REQUISITION_VERSION: "0",
      PLAYWRIGHT_BP_R7_ENGAGEMENT_ID: uuid("4"),
      PLAYWRIGHT_BP_R7_ENGAGEMENT_VERSION: "2",
      PLAYWRIGHT_BP_R7_COMPANY_CODE_ID: uuid("5"),
      PLAYWRIGHT_BP_R7_PLACEMENT_EFFECTIVE_FROM: "2026-09-05",
    });
    assert.deepEqual(invalid.invalid, ["PLAYWRIGHT_BP_R7_REQUISITION_VERSION"]);
  });
});
