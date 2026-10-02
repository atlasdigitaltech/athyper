import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import targets from "./auth-capture-target.cjs";

const source = await readFile(new URL("./capture-atlas-elevated-session.cjs", import.meta.url), "utf8");
const nativeRequire = createRequire(import.meta.url);

async function capture(options, wrongIdentity = false) {
  const target = targets.captureTarget({ repo: "/repo", ...options });
  const calls = { atlas: 0, stepUp: 0, saved: 0, closed: 0 };
  let assurance = "normal";
  let finished;
  const done = new Promise(resolve => { finished = resolve; });
  const context = {
    newPage: async () => ({ goto: async () => {} }),
    request: { get: async () => ({ ok: () => true, json: async () => ({
      state: "authenticated", plane: target.plane, tenantId: target.tenantId,
      principalId: wrongIdentity ? "wrong" : target.principalId, assurance,
    }) }) },
    storageState: async () => { calls.saved++; },
  };
  const process = { env: {}, pid: 1 };
  runInNewContext(source, {
    __dirname: "/repo/tooling/scripts/verification", process, setTimeout,
    console: { log() {}, error() {} },
    require(name) {
      if (name === "node:util") return { parseArgs: () => ({ values: options }) };
      if (name === "node:fs") return {
        existsSync: () => false, mkdirSync() {}, chmodSync() {}, renameSync() {}, rmSync() {},
      };
      if (name === "./auth-capture-target.cjs") return targets;
      if (name === "./auth-capture-step-up.cjs") return {
        startCaptureStepUp: async () => { calls.stepUp++; assurance = "elevated"; },
        atlasAdmissionAllowed: async () => { calls.atlas++; return true; },
      };
      if (name === "@playwright/test") return { chromium: { launch: async () => ({
        newContext: async () => context,
        close: async () => { calls.closed++; finished(); },
      }) } };
      return nativeRequire(name);
    },
  });
  await done;
  return calls;
}

test("finance normal capture verifies identity without step-up or Atlas access", async () => {
  const calls = await capture({ plane: "neon", actor: "catl.finance", normal: true, "session-only": true });
  assert.deepEqual(calls, { atlas: 0, stepUp: 0, saved: 1, closed: 1 });
});
test("finance elevated capture performs MFA without Atlas permissions", async () => {
  const calls = await capture({ plane: "neon", actor: "catl.finance", "session-only": true });
  assert.deepEqual(calls, { atlas: 0, stepUp: 1, saved: 1, closed: 1 });
});
test("default admin capture still requires elevated assurance and Atlas admission", async () => {
  const calls = await capture({ plane: "neon", actor: "catl.admin" });
  assert.equal(calls.stepUp, 1);
  assert.equal(calls.atlas, 1);
  assert.equal(calls.saved, 1);
});
test("wrong finance identity never replaces saved state", async () => {
  const calls = await capture({ plane: "neon", actor: "catl.finance", normal: true, "session-only": true }, true);
  assert.equal(calls.saved, 0);
  assert.equal(calls.closed, 1);
});
