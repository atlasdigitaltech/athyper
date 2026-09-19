// Fixture-backed UI verification only. No publication or approval reaches the server.
const { chromium } = require(process.cwd() + "/node_modules/@playwright/test");
const fs = require("fs");
(async () => {
  const b = await chromium.launch();
  try {
    const c = await b.newContext({
      ignoreHTTPSErrors: true,
      storageState: "tests/e2e/.auth/dev/studio/catl.admin.json",
      viewport: { width: 1440, height: 1000 },
    });
    const p = await c.newPage();
    p.setDefaultTimeout(15000);
    const id = "c2cc6900-26c1-47ca-8dfc-1d488000950c";
    const target = {
      plane: "neon",
      state: "active",
      releaseId: id,
      contractHash: "fixture-hash",
      descriptorSourceHash: "fixture-hash",
      descriptorHash: "fixture-descriptor",
      appliedReleaseId: "fixture-applied",
      activatedAt: "2026-09-15T20:00:00Z",
    };
    const tracking = {
      releaseId: id,
      contractHash: "fixture-hash",
      tenantId: "fixture-tenant",
      targets: [target],
      observedAt: "2026-09-15T21:00:00Z",
    };
    let changed = false;
    const writes = [],
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/api/relay/meta-entity-authoring/**", async (r) => {
      if (r.request().method() !== "GET") {
        writes.push(r.request().url());
        return r.fulfill({
          status: 403,
          json: { error: "Fixture forbids mutations" },
        });
      }
      const url = r.request().url();
      if (url.endsWith("/activation"))
        return r.fulfill({
          json: changed
            ? { ...tracking, targets: [{ ...target, descriptorHash: "other" }] }
            : tracking,
        });
      if (url.endsWith("/" + id))
        return r.fulfill({
          json: {
            release: {
              id,
              contractHash: "fixture-hash",
              releaseNo: 2,
              changeSetId: "fixture-draft",
              targetPlanes: ["neon"],
            },
            graph: {
              entity: { entityCode: "business_partner" },
              surfaces: [{ id: "s", surfaceKey: "intake_partner" }],
              fields: [{ id: "f", fieldKey: "requested_role" }],
              surfaceFieldBindings: [
                {
                  entitySurfaceId: "s",
                  entityFieldId: "f",
                  labelOverride: "Published fixture role",
                },
              ],
            },
          },
        });
      return r.fulfill({ json: [] });
    });
    await p.goto(
      `https://studio.dev.athyper.test/mdg/business-partner/publication?inspect=release%3A${id}`,
      { waitUntil: "domcontentloaded" },
    );
    await p.getByText("Confirmed active:", { exact: false }).waitFor();
    const proof = {
      schema: "athyper.studio-workbench-neon-verification/2",
      passed: true,
      releaseId: id,
      contractHash: "fixture-hash",
      tenantId: "fixture-tenant",
      target,
      runtimeDescriptorHash: "fixture-descriptor",
      surfaceKey: "intake_partner",
      fieldKey: "requested_role",
      expectedText: "Published fixture role",
      observedAt: "2026-09-15T21:00:00Z",
    };
    await p
      .locator("#neon-proof-file")
      .setInputFiles({
        name: "fixture-evidence.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(proof)),
      });
    await p
      .getByText(
        "Imported browser observation matches the current release and activation.",
        { exact: true },
      )
      .waitFor();
    await p
      .getByRole("region", { name: "Neon browser proof" })
      .screenshot({
        path: "docs/architecture/business-partner/phase4-evidence/proof-desktop.png",
      });
    await p.setViewportSize({ width: 390, height: 844 });
    const overflow = await p.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    await p
      .getByRole("region", { name: "Neon browser proof" })
      .screenshot({
        path: "docs/architecture/business-partner/phase4-evidence/proof-mobile.png",
      });
    changed = true;
    await p
      .getByRole("button", { name: "Check target activation", exact: true })
      .click();
    await p
      .getByText(
        "The observation does not match the current Neon activation and runtime descriptor.",
        { exact: true },
      )
      .waitFor();
    const evidence = {
      fixtureBacked: true,
      importMatched: true,
      staleObservationRejected: true,
      mobileOverflow: overflow,
      authoringWrites: writes,
      pageErrors: errors,
    };
    fs.writeFileSync(
      "docs/architecture/business-partner/phase4-evidence/browser-check.json",
      JSON.stringify(evidence, null, 2),
    );
    console.log(evidence);
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
