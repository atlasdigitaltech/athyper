import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { images, save, authenticated } from "./atlas-f6-common.mjs";
const dir = mkdtempSync(join(tmpdir(), "atlas-reliability-")),
  file = join(dir, "browser.json");
const report = {
  observedAt: new Date().toISOString(),
  kind: "authenticated-grounded-chat-regression",
  imagesBefore: images(),
};
let auth;
try {
  auth = await authenticated("neon", "catl.admin");
  if (auth.session.assurance !== "elevated")
    throw Error("Elevated Neon session required");
  await auth.close();
  auth = undefined;
  const child = spawnSync(
    process.execPath,
    ["tooling/scripts/verification/qualify-atlas-document-chat.mjs"],
    {
      env: { ...process.env, ATLAS_CHAT_REPORT_PATH: file },
      encoding: "utf8",
      timeout: 180000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  const result = JSON.parse(readFileSync(file, "utf8"));
  Object.assign(report, {
    passed: child.status === 0 && result.passed === true,
    status: result.status,
    runId: result.runId,
    threadId: result.threadId,
    checks: result.checks,
    terminalEvent: result.events?.at(-1)?.event.type,
  });
} catch (e) {
  report.passed = false;
  report.error =
    e.message === "Elevated Neon session required"
      ? e.message
      : "Grounded browser assessment failed; inspect the scoped test.";
} finally {
  if (auth) await auth.close();
  rmSync(dir, { recursive: true, force: true });
  report.imagesAfter = images();
  report.stableDeployment =
    JSON.stringify(report.imagesBefore) === JSON.stringify(report.imagesAfter);
  report.passed = report.passed && report.stableDeployment;
  save("inference-reliability-grounded.json", report);
  console.log(JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
}
