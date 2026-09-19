import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const functions = readFileSync(
  new URL("../../../ddl/planes/neon/control/07_functions.sql", import.meta.url),
  "utf8",
);
const masterFunctions = readFileSync(
  new URL("../../../ddl/planes/neon/master/07_functions.sql", import.meta.url),
  "utf8",
);

describe("R5 Customer control authority", () => {
  it("retains BP-CUS-001 Customer materialization, snapshot lineage, command, and outbox proof", () => {
    assert.match(masterFunctions, /requested_role='customer'[\s\S]*?INSERT INTO master\.customer/);
    assert.match(masterFunctions, /INSERT INTO snapshot\.entity_case_snapshot_lineage/);
    assert.match(masterFunctions, /INSERT INTO document\.entity_case_command_evidence/);
    assert.match(masterFunctions, /'entity\.case\.materialized'/);
  });
  it("writes validated compatibility and normalized scope from one decision command", () => {
    assert.match(
      functions,
      /INSERT INTO control\.customer_account_designation\([\s\S]*?operating_organization_id,company_code_id,[\s\S]*?VALUES\([\s\S]*?p_operating_organization_id,p_company_code_id/,
    );
    assert.match(
      functions,
      /INSERT INTO control\.customer_credit_review\([\s\S]*?operating_organization_id,company_code_id,[\s\S]*?VALUES\([\s\S]*?p_operating_organization_id,p_company_code_id/,
    );
    assert.match(
      functions,
      /INSERT INTO control\.business_partner_decision_scope[\s\S]*?'operating_organization'[\s\S]*?'company_code'/,
    );
  });

  it("rejects overlapping approved designations in the same effective scope", () => {
    assert.match(
      functions,
      /Overlapping approved customer account designation scope exists/,
    );
    assert.match(functions, /USING ERRCODE = 'exclusion_violation'/);
  });

  it("implements all five versioned lifecycle actions and valid source states", () => {
    for (const action of [
      "activate",
      "suspend",
      "reactivate",
      "deactivate",
      "archive",
    ])
      assert.match(functions, new RegExp(`'${action}'`));
    assert.match(functions, /v_customer\.record_version <> p_expected_version/);
    assert.match(
      functions,
      /p_action='deactivate'[\s\S]*?NOT IN \('active','suspended'\)/,
    );
  });
});
