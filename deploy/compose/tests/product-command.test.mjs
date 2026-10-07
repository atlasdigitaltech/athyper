import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("product-command overlay provides isolated read-only credential files without embedding credentials", () => {
  const source = readFileSync(
    new URL("../instance/compose.product-command.yaml", import.meta.url),
    "utf8",
  );
  for (const key of [
    "ISSUER_DATABASE_URL_FILE",
    "APPLICATION_DATABASE_URL_FILE",
    "APPLICATION_LOGIN",
    "LABEL_POLICY_FILE",
  ])
    assert.ok(source.includes(`PLATFORM_CONTROL_COMMAND_${key}:`));
  assert.equal((source.match(/:ro$/gm) ?? []).length, 3);
  assert.ok(source.includes("${ATHYPER_PRODUCT_COMMAND_ROOT:?"));
  assert.ok(!source.includes("postgresql://"));
});
test("gateway enroll-labels is an exact change-set operation, not a broad control route", () => {
  const source = readFileSync(
    new URL("../instance/config/traefik/dev.yaml", import.meta.url),
    "utf8",
  );
  const section = source.split("    platform-control:")[1].split("    iam:")[0];
  const pattern = [...section.matchAll(/PathRegexp\(`([^`]+)`\)/g)]
    .map((m) => m[1])
    .find((p) => p.includes("enroll-labels"));
  assert.ok(pattern);
  const route = new RegExp(pattern);
  const root =
    "/api/platform-control/meta-entity-authoring/change-sets/00000000-0000-4000-8000-000000000001";
  assert.ok(route.test(root + "/enroll-labels"));
  for (const suffix of [
    "/execute",
    "/enroll-labels/extra",
    "/enroll-labels-other",
  ])
    assert.ok(!route.test(root + suffix));
  assert.ok(!section.includes("PathPrefix"));
});
