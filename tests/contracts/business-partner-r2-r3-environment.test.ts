import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

test("R2 and R3 use the reproducible Linux Playwright dependency wrapper", () => {
  const packageJson = JSON.parse(read("package.json"));
  for (const slice of ["r2", "r3"])
    assert.match(
      packageJson.scripts[`test:e2e:bp-${slice}`],
      /run-playwright-with-linux-deps\.sh test/,
    );
  const wrapper = read(
    "tooling/scripts/verification/run-playwright-with-linux-deps.sh",
  );
  for (const dependency of ["libnspr4", "libnss3", "libasound2t64"])
    assert.match(wrapper, new RegExp(dependency));
  assert.match(wrapper, /LD_LIBRARY_PATH/);
});

test("the Neon foundation groups IAM commands in the canonical function file", () => {
  const functions = read("server/db/ddl/planes/neon/document/07_functions.sql");
  assert.doesNotMatch(functions, /^\\ir /m);
  assert.equal(
    functions.match(
      /CREATE OR REPLACE FUNCTION document\.command_internal_workforce_identity_intent/g,
    )?.length,
    1,
  );
});

test("retained R2/R3 qualification no longer reports cleared host blockers", () => {
  for (const slice of ["r2", "r3"]) {
    const manifest = read(
      `governance/config/governance/business-partner-${slice}-qualification.v1.json`,
    );
    assert.doesNotMatch(manifest, /lacks the native Chromium dependency/i);
    assert.match(manifest, /preflight-business-partner-environment\.mjs/);
  }
});

test("R2 role-free targets are readable without an invalid commercial assignment", () => {
  const repository = read(
    "server/packages/services/master-data/src/kysely-business-partner-case-repository.ts",
  );
  assert.match(
    repository,
    /LEFT JOIN master\.business_partner_operating_organization_assignment/,
  );
  assert.match(
    repository,
    /a\.id IS NOT NULL OR NOT EXISTS\([\s\S]*business_partner_operating_organization_assignment scoped/,
  );
});
