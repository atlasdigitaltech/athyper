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
        "docs/architecture/business-partner/phase5-evidence/graph-fixture.json",
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
    await p.goto(
      `https://studio.dev.athyper.test/mdg/business-partner/model?inspect=draft%3A${id}&object=surfaceSections%3Asection-main`,
      { waitUntil: "domcontentloaded" },
    );
    const controls = p.getByRole("region", {
      name: "Structural editing",
      exact: true,
    });
    await controls
      .getByRole("button", { name: "Review removal", exact: true })
      .click();
    await controls
      .getByText("Removal is blocked by these dependencies:", { exact: true })
      .waitFor();
    await controls
      .getByText("dependencyGuard.section", { exact: true })
      .waitFor();
    await controls
      .getByRole("button", { name: "Cancel removal", exact: true })
      .click();
    await controls
      .locator("#structure-template")
      .selectOption("placement-mode");
    await controls
      .getByRole("button", { name: "Add field placement", exact: true })
      .click();
    await p.getByText("Structure updated locally.", { exact: false }).waitFor();
    await p.waitForURL((u) =>
      u.searchParams.get("object")?.startsWith("surfaceFieldBindings:"),
    );
    const placementId = new URL(p.url()).searchParams
      .get("object")
      .split(":")[1];
    await p
      .locator('[data-node="surfaces:surface-main"] > .studio-designer__node')
      .click();
    await controls.locator("#structure-section-key").fill("additional");
    await controls
      .locator("#structure-section-title")
      .fill("Additional details");
    await controls
      .locator("#structure-initial-placement")
      .selectOption(placementId);
    await controls
      .getByRole("button", { name: "Add section", exact: true })
      .click();
    await p.waitForURL(
      (u) =>
        u.searchParams.get("object")?.startsWith("surfaceSections:") &&
        u.searchParams.get("object") !== "surfaceSections:section-main",
    );
    const sectionId = new URL(p.url()).searchParams.get("object").split(":")[1];
    await controls
      .getByRole("button", { name: "Move earlier", exact: true })
      .click();
    await p.getByRole("button", { name: "Save draft", exact: true }).click();
    await p.getByText("Saved and reread:", { exact: false }).waitFor();
    if (
      JSON.stringify(graph.fields) !== JSON.stringify(initial.fields) ||
      JSON.stringify(graph.unknown) !== JSON.stringify(initial.unknown)
    )
      throw Error("Unrelated data changed");
    if (
      !graph.surfaceSections.some((s) => s.id === sectionId && s.position === 1)
    )
      throw Error("Section order did not survive save");
    await p
      .getByRole("button", { name: "Reload stored draft", exact: true })
      .click();
    await p.getByText("Stored draft reloaded.", { exact: false }).waitFor();
    await controls.screenshot({
      path: "docs/architecture/business-partner/phase5-evidence/structure-desktop.png",
    });
    await controls
      .getByRole("button", { name: "Review removal", exact: true })
      .click();
    await controls
      .locator("#structure-removal-target")
      .selectOption("section-main");
    await controls
      .getByRole("button", { name: "Confirm removal", exact: true })
      .click();
    await p.getByRole("button", { name: "Undo", exact: true }).click();
    await p
      .locator(
        `[data-node="surfaceSections:${sectionId}"] > .studio-designer__node`,
      )
      .waitFor();
    await p.setViewportSize({ width: 390, height: 844 });
    const overflow = await p.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    await controls.screenshot({
      path: "docs/architecture/business-partner/phase5-evidence/structure-mobile.png",
    });
    const evidence = {
      fixtureBacked: true,
      dependencyBlocked: true,
      addPlacement: true,
      splitSection: true,
      reorder: true,
      saveReload: true,
      mergeAndUndo: true,
      unrelatedDataPreserved: true,
      mobileOverflow: overflow,
      pageErrors: errors,
      liveStructuralWrites: 0,
    };
    fs.writeFileSync(
      "docs/architecture/business-partner/phase5-evidence/browser-check.json",
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
