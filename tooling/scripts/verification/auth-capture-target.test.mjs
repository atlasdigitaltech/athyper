import { test } from "node:test";
import assert from "node:assert/strict";
import targets from "./auth-capture-target.cjs";
import { validateSession } from "../local-dev/qa-session.mjs";
const input = { repo: "/repo", plane: "neon", actor: "catl.admin" };
test("DEV remains default; QA URLs and actor files are separate", () => {
  const dev = targets.captureTarget(input),
    qa = targets.captureTarget({ ...input, environment: "qa" });
  assert.equal(dev.origin, "https://neon.dev.athyper.test");
  assert.equal(qa.origin, "https://neon.qa.athyper.test");
  assert.equal(qa.statePath, "/repo/tests/e2e/.auth/qa/neon/catl.admin.json");
  assert.notEqual(dev.statePath, qa.statePath);
});
test("rejects unknown environment, plane and path injection in actor", () => {
  for (const patch of [
    { environment: "prod" },
    { plane: "__proto__" },
    { actor: "../../token" },
  ])
    assert.throws(() => targets.captureTarget({ ...input, ...patch }));
});
test("QA validation requires the plane-specific Cirrus principal", () => {
  const neon = targets.captureTarget({ ...input, environment: "qa" }),
    studio = targets.captureTarget({
      ...input,
      plane: "studio",
      environment: "qa",
    });
  assert.notEqual(neon.principalId, studio.principalId);
  const session = {
    state: "authenticated",
    plane: "neon",
    tenantId: neon.tenantId,
    principalId: neon.principalId,
  };
  validateSession(session, "neon", "catl.admin");
  assert.throws(() =>
    validateSession(
      { ...session, principalId: studio.principalId },
      "neon",
      "catl.admin",
    ),
  );
});
test("isolated Studio uses its own state and transport and rejects other targets", () => {
  const studio = { ...input, plane: "studio", "isolated-studio": true };
  const isolated = targets.captureTarget(studio);
  assert.equal(isolated.proxy.server, "http://127.0.0.1:13330");
  assert.match(
    isolated.statePath,
    /bp-enter-isolated-20260911\/ui-auth\/dev\/studio\/catl.admin\.json$/,
  );
  assert.notEqual(
    isolated.statePath,
    targets.captureTarget({ ...studio, "isolated-studio": false }).statePath,
  );
  for (const patch of [
    { environment: "qa" },
    { plane: "neon" },
    { actor: "athyper.admin" },
  ])
    assert.throws(() => targets.captureTarget({ ...studio, ...patch }));
});
test("isolated NEON uses its own state and rejects mismatched capture targets", () => {
  const options = { ...input, plane: "neon", "isolated-neon": true };
  const neon = targets.captureTarget(options);
  assert.equal(neon.proxy.server, "http://127.0.0.1:13320");
  assert.match(
    neon.statePath,
    /bp-enter-isolated-20260911\/ui-auth\/dev\/neon\/catl.admin\.json$/,
  );
  for (const patch of [
    { plane: "studio" },
    { environment: "qa" },
    { actor: "athyper.admin" },
    { "isolated-studio": true },
  ])
    assert.throws(() => targets.captureTarget({ ...options, ...patch }));
});
