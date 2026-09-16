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
    const captured = JSON.parse(
      fs.readFileSync(
        "docs/architecture/business-partner/baseline-audit-20260916/studio-intake-fixture.json",
      ),
    );
    const binding = captured.bindings.find(
      (b) => b.id === "dd030024-3640-5185-874f-445546fc0027",
    );
    const descriptor = JSON.parse(
      fs.readFileSync(
        "docs/architecture/business-partner/baseline-audit-20260916/neon-descriptor-fixture.json",
      ),
    );
    const role = descriptor.surfaces
      .flatMap((s) => s.sections)
      .flatMap((s) => s.fields)
      .find((f) => f.key === "requested_role");
    binding.entityFieldId = "fixture-requested-role";
    binding.position = 0;
    binding.displayConfig = { required: role.required, options: role.options };
    const graph = {
      entity: {
        entityCode: "business_partner",
        id: captured.changeSet.entityId,
      },
      surfaces: [captured.surface],
      surfaceSections: [
        {
          id: binding.entitySurfaceSectionId,
          entitySurfaceId: captured.surface.id,
          sectionKey: "role",
          title: "Role",
          position: 0,
          columnCount: 1,
        },
      ],
      surfaceFieldBindings: [binding],
      fields: [
        {
          id: binding.entityFieldId,
          fieldKey: "requested_role",
          dataType: "string",
          typeConfig: { kind: "string" },
          valueOrigin: "runtime",
          writeMode: "mutable",
          validationSpec: {
            schema_version: 1,
            rules: [
              {
                kind: "allowed_values",
                parameters: {
                  values: binding.displayConfig.options.map((o) => o.value),
                },
              },
            ],
          },
        },
      ],
    };
    await p.route("**/api/relay/meta-entity-authoring/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/graph"))
        return route.fulfill({
          json: { changeSet: captured.changeSet, graph },
        });
      if (url.includes("/inspection/releases/"))
        return route.fulfill({
          json: {
            release: {
              id: "c2cc6900-26c1-47ca-8dfc-1d488000950c",
              releaseNo: 2,
              status: "published",
            },
            graph: {
              ...graph,
              surfaces: [{ ...captured.surface, layoutConfig: {} }],
            },
          },
        });
      return route.fulfill({ json: [] });
    });
    const errors = [],
      writes = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("request", (r) => {
      if (
        r.url().includes("/meta-entity-authoring/") &&
        !["GET", "OPTIONS"].includes(r.method())
      )
        writes.push(r.url());
    });
    await p.goto(
      "https://studio.dev.athyper.test/mdg/business-partner/model?inspect=draft%3Abe767e01-f36d-434f-91f3-67bff689a367&object=surfaceFieldBindings%3Add030024-3640-5185-874f-445546fc0027",
      { waitUntil: "domcontentloaded" },
    );
    const input = p.locator("#composition-labelOverride");
    await input.waitFor({ timeout: 15000 }).catch(async (e) => {
      console.log((await p.locator("body").innerText()).slice(-6000));
      throw e;
    });
    await input.fill("Preview business role");
    const review = p.getByRole("region", { name: "Preview and differences" });
    await review.getByText("Changes (1)", { exact: true }).waitFor();
    await review
      .getByText("Render base and working copy", { exact: true })
      .click();
    await review
      .locator("legend")
      .filter({ hasText: "Preview business role" })
      .waitFor();
    await review
      .locator("legend")
      .filter({ hasText: "Requested role" })
      .waitFor();
    await review
      .getByRole("button", { name: "Check required fields", exact: true })
      .last()
      .click();
    await review
      .getByRole("alert")
      .filter({ hasText: "Select preview business role." })
      .waitFor();
    await review.screenshot({
      path: "docs/architecture/business-partner/phase3-evidence/preview-desktop.png",
    });
    await review
      .getByRole("button", { name: "Inspect object", exact: true })
      .click();
    if (
      (await p.evaluate(() => document.activeElement?.id)) !==
      "studio-composition-properties"
    )
      throw Error("Properties did not receive focus");
    await review.locator("#review-mode").selectOption("saved");
    await review
      .getByText("No changes from the loaded base.", { exact: true })
      .waitFor();
    if (
      await review.getByText("Preview business role", { exact: true }).count()
    )
      throw Error("Unsaved label leaked into saved view");
    await review.locator("#review-mode").selectOption("working");
    await p.setViewportSize({ width: 390, height: 844 });
    await review.screenshot({
      path: "docs/architecture/business-partner/phase3-evidence/preview-mobile.png",
    });
    const overflow = await p.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    await p.getByRole("button", { name: "Undo", exact: true }).click();
    await p.goto(
      "https://studio.dev.athyper.test/mdg/business-partner/model?inspect=release%3Ac2cc6900-26c1-47ca-8dfc-1d488000950c",
      { waitUntil: "domcontentloaded" },
    );
    await p.getByText("Render base and working copy", { exact: true }).click();
    await p
      .getByText(
        "Preview unavailable: this surface does not use the supported intake renderer.",
        { exact: false },
      )
      .first()
      .waitFor();
    const result = {
      liveBrowser: true,
      dataSource:
        "Browser-intercepted minimal fixture; captured surface/binding, synthetic field/section. Live APIs deny this session",
      unsavedLabelRendered: true,
      baseUnaffected: true,
      savedViewUnaffected: true,
      requiredFieldFeedbackVerified: true,
      propertiesFocused: true,
      unsupportedReleaseExplicit: true,
      mobileOverflow: overflow,
      authoringWrites: writes,
      errors,
    };
    fs.writeFileSync(
      "docs/architecture/business-partner/phase3-evidence/browser-check.json",
      JSON.stringify(result, null, 2),
    );
    console.log(result);
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
