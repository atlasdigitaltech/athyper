import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
const root =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911",
  journey = JSON.parse(
    fs.readFileSync(
      "governance/policy/reports/business-partner-dependency-final-commands-20260912.dev.json",
    ),
  );
const id = journey.appliedCase.targetBusinessPartnerId;
const browser = await chromium.launch(),
  context = await browser.newContext({
    ignoreHTTPSErrors: true,
    proxy: { server: "http://127.0.0.1:13320" },
    storageState: root + "/ui-auth/dev/neon/catl.admin.json",
  }),
  checks = [];
let failure;
try {
  const page = await context.newPage(),
    responses = [];
  page.on("response", (r) => {
    if (r.url().includes("/360/"))
      responses.push({ path: new URL(r.url()).pathname, status: r.status() });
  });
  const summary = page.waitForResponse(
    (r) => r.url().includes("/" + id + "/360/summary") && r.status() === 200,
  );
  await page.goto("https://neon.dev.athyper.test/mdg/business-partner/" + id);
  await summary;
  await page
    .getByRole("heading", {
      name: "Isolated Enter Qualification " + journey.runId,
      exact: true,
    })
    .waitFor();
  checks.push("record_identity");
  for (const section of ["Contacts", "Addresses"]) {
    const path = section.toLowerCase();
    const loaded = page.waitForResponse(
      (r) => r.url().includes("/" + id + "/360/" + path) && r.status() === 200,
    );
    await page
      .getByRole("button", { name: new RegExp("^" + section) })
      .first()
      .click();
    await loaded;
    await page
      .getByText(
        section === "Contacts"
          ? "Isolated Qualification Contact"
          : "1 Isolated Qualification Road, London, SW1A 1AA, GB",
        { exact: true },
      )
      .first()
      .waitFor();
    checks.push("section_" + path);
  }
  await page.screenshot({
    path: root + "/record-qualified.png",
    fullPage: true,
  });
  checks.push("section_fields_rendered");
  const out =
    "governance/policy/reports/business-partner-record-browser-20260912.dev.json";
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        recordId: id,
        releaseSet: journey.releaseSet,
        image: journey.image,
        checks,
        responses,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log({ passed: true, report: out });
} catch (e) {
  failure = e.message.split("\n")[0];
  console.log({ failure, checks });
  process.exitCode = 1;
} finally {
  await browser.close();
}
