import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("S2 removes workforce execution and UI from Business Partner 360", async () => {
  for (const path of [
    "packages/services/master-data/src/kysely-business-partner-360-workforce.ts",
    "../packages/planes/neon/business-partner/src/360/components/workforce-section.tsx",
    "../packages/planes/neon/business-partner/src/360/business-partner-360-workforce-client.ts",
  ]) {
    await assert.rejects(access(resolve(root, path), constants.F_OK));
  }
  const [service, repository, shell] = await Promise.all([
    read("packages/services/master-data/src/business-partner-360-service.ts"),
    read("packages/services/master-data/src/kysely-business-partner-360-repository.ts"),
    read("../packages/planes/neon/business-partner/src/360/business-partner-360.tsx"),
  ]);
  assert.doesNotMatch(service, /readWorkforceSection|change_employment/);
  assert.doesNotMatch(repository, /person\.business_partner_id|['"]workforce['"]/);
  assert.doesNotMatch(shell, /WorkforceSection|roleLens===['"]workforce['"]/);
});

test("S2 routes workforce requests through the People authority with protected identity evidence", async () => {
  const [service, repository, client] = await Promise.all([
    read("packages/services/master-data/src/workforce-service.ts"),
    read("packages/services/master-data/src/kysely-workforce-request-repository.ts"),
    read("../packages/planes/neon/workforce/src/client.ts"),
  ]);
  assert.match(repository, /document\.workforce_request/);
  assert.match(service, /protectedProfileContentItemId/);
  assert.match(service, /Restricted person values belong in protected profile content/);
  assert.match(client, /\/api\/neon\/workforce-requests/);
  assert.doesNotMatch(client, /dateOfBirth|nationalId|passport|compensation|billRate/i);
});

test("S2 completes validation, maker-checker workflow, and People-only materialization", async () => {
  const [tables, functions, constraints, repository, routes, permissions] = await Promise.all([
    read("db/ddl/planes/neon/document/03_tables.sql"), read("db/ddl/planes/neon/document/07_functions.sql"),
    read("db/ddl/planes/neon/document/05_constraints.sql"), read("packages/services/master-data/src/kysely-workforce-request-repository.ts"),
    read("packages/services/master-data/src/workforce-routes.ts"), read("db/ddl/planes/neon/authz/14_permission_reference_seed.sql"),
  ]);
  assert.match(tables, /CREATE TABLE document\.workforce_request_validation/);
  assert.match(functions, /fn_workforce_request_approvers/);
  assert.match(functions, /OLD\.status NOT IN \('draft','validating','validation_failed','returned'\)/);
  assert.match(constraints, /workforce_request_validation_request_fk/);
  for (const table of ["master.person", "master.employee", "master.employment", "master.work_assignment", "document.onboarding_case"]) assert.match(repository, new RegExp(table.replace(".", "\\.")));
  for (const action of ["validate", "submit", "decision", "apply"]) assert.match(routes, new RegExp(`workforce-requests/:requestId/${action}`));
  for (const permission of ["validate", "submit", "decide", "apply"]) assert.match(permissions, new RegExp(`neon\\.workforce\\.request\\.${permission}`));
  assert.doesNotMatch(repository, /master\.business_partner|document\.business_partner_request/);
});

test("S2 keeps person and workforce fields out of MESH and generic BP exports", async () => {
  const [mesh, records] = await Promise.all([
    read("packages/services/publication/src/business-partner-foundation-definition.ts"),
    read("packages/services/records/src/transfer/transfer-service.ts"),
  ]);
  assert.match(mesh, /person\./);
  assert.match(mesh, /workforce\./);
  assert.match(records, /BUSINESS_PARTNER_EXPORT_WORKFORCE_FORBIDDEN/);
  assert.match(records, /entityCode!=="business_partner"/);
});
