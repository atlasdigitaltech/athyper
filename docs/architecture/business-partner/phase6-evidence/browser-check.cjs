// Isolated inspection/save responses. No structural writes reach the live Studio backend.
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
    const id = "be767e01-f36d-434f-91f3-67bff689a367";
    const initial = JSON.parse(
      fs.readFileSync(
        "docs/architecture/business-partner/phase6-evidence/graph-fixture.json",
      ),
    );
    initial.dependencyGuard = { section: "first" };
    let graph = structuredClone(initial),
      revision = 60,
      put;
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/api/relay/meta-entity-authoring/**", async (r) => {
      const url = r.request().url();
      if (url.endsWith("/graph")) {
        if (r.request().method() === "PUT") {
          put = r.request().postDataJSON();
          if (put.expectedRevision !== revision)
            throw Error("Expected revision mismatch");
          graph = { ...put };
          delete graph.expectedRevision;
          revision++;
          return r.fulfill({ json: { revision } });
        }
        return r.fulfill({
          json: { changeSet: { id, revision, status: "draft" }, graph },
        });
      }
      if (r.request().method() !== "GET")
        throw Error("Unexpected authoring mutation");
      return r.fulfill({ json: [] });
    });
    const base = `https://studio.dev.athyper.test/mdg/business-partner`;
    await p.goto(
      `${base}/validation?inspect=draft%3A${id}&object=surfaceFieldBindings%3Aplacement-role`,
      { waitUntil: "domcontentloaded" },
    );
    const controls = p.getByRole("region", {
      name: "Qualified configuration",
      exact: true,
    });
    await controls.locator("#configuration-required").selectOption("true");
    await controls
      .getByRole("button", { name: "Apply require a value", exact: true })
      .click();
    await p.getByRole("button", { name: "Save draft", exact: true }).click();
    await p.getByText("Saved and reread:", { exact: false }).waitFor();
    if (
      !graph.surfaceFieldBindings.find((r) => r.id === "placement-role")
        .displayConfig.required
    )
      throw Error("Rule not saved");
    await p.goto(
      `${base}/workflows?inspect=draft%3A${id}&object=flows%3Aflow`,
      { waitUntil: "domcontentloaded" },
    );
    await controls
      .locator("#configuration-navigationMode")
      .selectOption("free");
    await controls
      .getByRole("button", { name: "Apply navigation", exact: true })
      .click();
    await p.getByRole("button", { name: "Undo", exact: true }).click();
    if (
      (await controls.locator("#configuration-navigationMode").inputValue()) !==
      "linear"
    )
      throw Error("Undo failed");
    await controls
      .locator("#configuration-navigationMode")
      .selectOption("free");
    await controls
      .getByRole("button", { name: "Apply navigation", exact: true })
      .click();
    await p.getByRole("button", { name: "Save draft", exact: true }).click();
    await p.getByText("Saved and reread:", { exact: false }).waitFor();
    await p
      .getByRole("button", { name: "Reload stored draft", exact: true })
      .click();
    if (
      (await controls.locator("#configuration-navigationMode").inputValue()) !==
      "free"
    )
      throw Error("Reload failed");
    if (JSON.stringify(graph.fields) !== JSON.stringify(initial.fields))
      throw Error("Fields changed");
    await controls.screenshot({
      path: "docs/architecture/business-partner/phase6-evidence/workflow-desktop.png",
    });
    await p.goto(`${base}/operations?inspect=draft%3A${id}`, {
      waitUntil: "domcontentloaded",
    });
    const diagnosis = p.getByRole("region", {
      name: "Permission diagnosis",
      exact: true,
    });
    await diagnosis
      .getByText("Permission: bp.create", { exact: true })
      .waitFor();
    await diagnosis.locator("#diagnosis-reason").selectOption("mfa_required");
    await diagnosis.getByRole("status").getByText("Complete interactive MFA", {exact:false}).waitFor();
    await diagnosis.locator("#diagnosis-plane").selectOption("mesh");
    if (await diagnosis.locator("#diagnosis-reason").inputValue() !== "") throw Error("Stale response reason retained");
    await diagnosis
      .getByText("MFA requirement: Required by this operation", { exact: true })
      .waitFor();
    await p.setViewportSize({ width: 390, height: 844 });
    const overflow = await p.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    await diagnosis.screenshot({
      path: "docs/architecture/business-partner/phase6-evidence/diagnosis-mobile.png",
    });
    if (overflow || errors.length)
      throw Error(JSON.stringify({ overflow, errors }));
    const evidence = {
      fixtureBacked: true,
      requiredRuleSave: true,
      workflowSaveReload: true,
      undo: true,
      unrelatedDataPreserved: true,
      permissionPlaneSwitch: true,
      observedDenialGuidance: true,
      staleReasonCleared: true,
      mobileOverflow: overflow,
      pageErrors: errors,
      liveWrites: 0,
    };
    fs.writeFileSync(
      "docs/architecture/business-partner/phase6-evidence/browser-check.json",
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
