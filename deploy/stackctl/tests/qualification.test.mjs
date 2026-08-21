import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import YAML from "yaml";
import {
  qualificationGateFailures,
  requiredDeploymentGates,
} from "../src/qualification.mjs";

test("deployment qualification rejects provisional host and Defender states", () => {
  const directory = mkdtempSync(join(tmpdir(), "athyper-qualification-"));
  const path = join(directory, "phase-status.yaml");
  const previousPath = process.env.ATHYPER_QUALIFICATION_FILE;
  process.env.ATHYPER_QUALIFICATION_FILE = path;

  try {
    const status = Object.fromEntries(requiredDeploymentGates.map((gate) => [gate, "complete-test"]));
    status.hostQualification = "provisional-pass-cold-reboot-acceptance-pending";
    status.defenderWslCompatibility = "blocked-platform-regression";
    writeFileSync(path, YAML.stringify({ status }));

    const provisional = qualificationGateFailures();
    assert.ok(provisional.failures.includes(
      "hostQualification=provisional-pass-cold-reboot-acceptance-pending",
    ));
    assert.ok(provisional.failures.includes(
      "defenderWslCompatibility=blocked-platform-regression",
    ));

    status.hostQualification = "complete-cold-reboot-qualified";
    status.defenderWslCompatibility = "complete-delayed-channel-cold-start-qualified";
    writeFileSync(path, YAML.stringify({ status }));
    assert.deepEqual(qualificationGateFailures().failures, []);
  } finally {
    if (previousPath === undefined) delete process.env.ATHYPER_QUALIFICATION_FILE;
    else process.env.ATHYPER_QUALIFICATION_FILE = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});
