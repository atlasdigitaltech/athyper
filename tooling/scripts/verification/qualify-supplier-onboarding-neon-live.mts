import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const origin = "https://neon.dev.athyper.test",
  fixtures = JSON.parse(
    readFileSync(
      "governance/policy/reports/supplier-onboarding-communications-live.dev.json",
      "utf8",
    ),
  ).cases;
const report: any = {
  at: new Date().toISOString(),
  scope:
    "P8 existing NEON screens against real owning APIs; P7 completed fixtures retained",
  checks: [],
  passed: false,
};
const p9 = process.argv.includes("--p9");
const path = p9 ? "governance/policy/reports/supplier-onboarding-p9-browser.dev.json" : "governance/policy/reports/supplier-onboarding-neon-live.dev.json";
if (process.argv.includes("--resume")) {
  const prior = JSON.parse(readFileSync(path, "utf8"));
  report.checks = prior.checks.filter(
    (c: any) =>
      c.readinessLinkScopePreserved && c.activeSupplierCannotBeActivatedAgain,
  );
  report.resumedAt = new Date().toISOString();
}
mkdirSync("governance/policy/reports/p8-browser", { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const principal of ["catl.admin", "catl.owner"]) {
    const context = await browser.newContext({
      storageState: `tests/e2e/.auth/dev/neon/${principal}.json`,
      ignoreHTTPSErrors: true,
    });
    try {
      for (const fixture of fixtures) {
        if (
          report.checks.some(
            (c: any) => c.principal === principal && c.caseId === fixture.id,
          )
        )
          continue;
        await delay(p9 ? 45000 : 15000);
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("response", (r) => {
          if (r.status() >= 400 && r.url().includes("/api/relay/")) {
            report.networkFailures ??= [];
            report.networkFailures.push({
              path: new URL(r.url()).pathname,
              status: r.status(),
            });
          }
        });
        await page.goto(
          `${origin}/mdg/business-partner/requests/${fixture.id}`,
        );
        const data = await page.evaluate(async (id) => {
          const tr = await fetch(
            `/api/relay/governance/process-tasks/cases/${id}/view`,
          );
          const tasks = { status: tr.status, body: await tr.json() };
          const dr = await fetch(
            `/api/relay/governance/process-documents/cases/${id}/view`,
          );
          const docs = { status: dr.status, body: await dr.json() };
          const run = tasks.body.coordinate?.cycleRunId;
          let readiness;
          if (run) {
            const rr = await fetch(
              `/api/relay/governance/supplier-onboarding/runs/${run}/readiness`,
            );
            readiness = { status: rr.status, body: await rr.json() };
          }
          return { tasks, docs, readiness };
        }, fixture.id);
        assert.equal(
          data.tasks.status,
          200,
          `task view ${principal}: ${data.tasks.status}`,
        );
        assert.equal(
          data.docs.status,
          200,
          `documents ${principal}: ${data.docs.status}`,
        );
        assert.equal(data.readiness?.status, 200);
        assert.ok(data.tasks.body.selection);
        assert.ok(data.tasks.body.tasks.length > 0);
        assert.ok(
          data.tasks.body.executions.every(
            (i: any) => i.allowedActions.length === 0,
          ),
        );
        assert.equal(data.readiness!.body.evidence.runStatus, "completed");
        assert.equal(data.readiness!.body.evidence.canComplete, false);
        assert.equal(
          new Set(data.docs.body.map((d: any) => d.purpose)).size,
          3,
        );
        await page
          .getByRole("heading", {
            name: "Supplier onboarding journey",
            exact: true,
          })
          .waitFor()
          .catch(async (error) => {
            report.alerts = await page.getByRole("alert").allTextContents();
            report.pageErrors = errors;
            throw error;
          });
        await page
          .getByRole("heading", { name: "Readiness and closure", exact: true })
          .waitFor();
        assert.equal(
          await page
            .getByRole("button", { name: "Approve assigned step", exact: true })
            .count(),
          0,
        );
        assert.equal(
          await page
            .getByRole("button", {
              name: "Close completed onboarding",
              exact: true,
            })
            .count(),
          0,
        );
        assert.equal(errors.length, 0, errors.join("\n"));
        const job = data.docs.body.find(
          (d: any) => d.purpose === "activation_confirmation",
        );
        await page.goto(
          `${origin}/mdg/business-partner/requests/${fixture.id}?attemptId=${data.tasks.body.coordinate.attemptId}&documentJobId=${job.id}`,
        );
        await page
          .getByText("Linked document · ready", { exact: false })
          .waitFor();
        const downloads = [];
        for (const d of data.docs.body.filter((d: any) => d.canDownload)) {
          await delay(3000);
          const label =
            d.purpose === "submitted_review_pack"
              ? "submitted review pack"
              : d.purpose === "decision_document"
                ? "decision document"
                : "activation confirmation";
          const response = page.waitForResponse(
            (r) =>
              r.url().endsWith(`/jobs/${d.id}/download`) &&
              r.request().method() === "POST",
          );
          await page
            .getByRole("button", { name: `Download ${label}`, exact: true })
            .click();
          const r = await response;
          assert.equal(r.status(), 200);
          const link = await r.json();
          const pdf = await context.request.get(link.url);
          assert.equal(pdf.status(), 200);
          const bytes = await pdf.body();
          assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
          const sha256 = createHash("sha256").update(bytes).digest("hex");
          assert.equal(sha256, d.result.sha256);
          downloads.push({
            purpose: d.purpose,
            jobId: d.id,
            sha256,
            bytes: bytes.length,
          });
        }
        const screenshot = `governance/policy/reports/p8-browser/${principal}-${fixture.id}.png`;
        await page.screenshot({ path: screenshot, fullPage: true });
        report.checks.push({
          principal,
          caseId: fixture.id,
          requirement: data.tasks.body.selection.requestedRequirement,
          profile: data.tasks.body.selection.effectiveProfile.code,
          taskCount: data.tasks.body.tasks.length,
          documentPurposes: data.docs.body.map((d: any) => ({
            purpose: d.purpose,
            canDownload: d.canDownload,
            canRetry: d.canRetry,
          })),
          communicationCount: data.tasks.body.communications.length,
          readinessStatus: data.readiness!.body.evidence.runStatus,
          closedCommandsHidden: true,
          documentPinPreserved: true,
          downloads,
          screenshot,
        });
        await page.goto(
          `${origin}/mdg/business-partner/requests/${fixture.id}?attemptId=00000000-0000-4000-8000-000000000001`,
        );
        await page
          .getByRole("heading", { name: "This notice is no longer actionable" })
          .waitFor();
        assert.equal(
          await page
            .getByRole("button", {
              name: /Approve assigned step|Accept review|Close proposal/,
            })
            .count(),
          0,
        );
        await page.goto(
          `${origin}/mdg/business-partner/requests/${fixture.id}`,
        );
        const controls = page.getByRole("link", {
          name: "Open supplier readiness and company setup",
          exact: true,
        });
        const href = await controls.getAttribute("href");
        assert.ok(
          href?.includes(
            `operatingOrganizationId=${data.tasks.body.coordinate.scope.operatingOrganizationId}`,
          ),
        );
        assert.ok(
          href?.includes(
            `companyCodeId=${data.tasks.body.coordinate.scope.companyCodeId}`,
          ),
        );
        await controls.click();
        await page
          .getByLabel("Purchasing organization", { exact: true })
          .waitFor();
        assert.equal(
          await page
            .getByLabel("Purchasing organization", { exact: true })
            .inputValue(),
          data.tasks.body.coordinate.scope.operatingOrganizationId,
        );
        assert.equal(
          await page
            .getByLabel("Payment company", { exact: true })
            .inputValue(),
          data.tasks.body.coordinate.scope.companyCodeId,
        );
        await page
          .getByRole("heading", { name: "Scoped qualifications", exact: true })
          .waitFor();
        assert.equal(
          await page
            .getByRole("button", {
              name: "Create activation case",
              exact: true,
            })
            .count(),
          0,
        );
        report.checks.at(-1).readinessLinkScopePreserved = true;
        report.checks.at(-1).activeSupplierCannotBeActivatedAgain = true;
        await page.close();
      }
    } finally {
      await context.close();
    }
  }
  report.passed = true;
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
  await browser.close();
  console.log(
    JSON.stringify({
      path,
      passed: report.passed,
      checks: report.checks.length,
      error: report.error,
    }),
  );
}
