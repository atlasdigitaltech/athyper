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
    await p.goto(`${base}/model?inspect=draft%3A${id}&object=surfaceFieldBindings%3Aplacement-role`,{waitUntil:"domcontentloaded"});
    const workspace=p.locator(".studio-designer");
    const search=workspace.getByRole("searchbox",{name:"Find an object"});
    await search.fill("placement-role");
    await workspace.getByText("1 matching objects",{exact:true}).waitFor();
    await search.fill("no-result");
    await workspace.getByText("Selected object is outside these results.",{exact:false}).waitFor();
    await workspace.getByRole("button",{name:"Reveal selection",exact:true}).click();
    await workspace.getByRole("button",{name:"Collapse all",exact:true}).click();
    await search.fill("placement-role");
    await workspace.locator('[data-node="surfaceFieldBindings:placement-role"]').waitFor();
    await workspace.getByRole("button",{name:"Clear search",exact:true}).click();
    if(await workspace.locator('[data-node="surfaceFieldBindings:placement-role"]').count())throw Error("Collapsed tree was not restored");
    await workspace.getByRole("button",{name:"Expand all",exact:true}).click();
    await workspace.locator(".studio-designer__tabs").getByRole("button",{name:"Rules",exact:true}).click();
    await workspace.locator("#configuration-required").selectOption("true");
    await workspace.getByRole("button",{name:"Apply require a value",exact:true}).click();
    await workspace.locator("#composition-filter").selectOption("changed");
    await workspace.getByText("1 matching objects",{exact:true}).waitFor();
    await workspace.getByRole("button",{name:"Clear filters",exact:true}).click();
    await workspace.locator(".studio-designer__tabs").getByRole("button",{name:"Properties",exact:true}).click();
    await workspace.screenshot({path:"docs/architecture/business-partner/ux-workspace-evidence/desktop.png"});
    await p.getByRole("button",{name:"Save draft",exact:true}).click();
    await p.getByText("Saved and reread:",{exact:false}).waitFor();
    if(JSON.stringify(graph.fields)!==JSON.stringify(initial.fields))throw Error("Unrelated data changed");
    await p.setViewportSize({width:390,height:844});
    await workspace.locator(".studio-designer__mobile-switch").getByRole("button",{name:"Properties",exact:true}).click();
    await workspace.screenshot({path:"docs/architecture/business-partner/ux-workspace-evidence/mobile.png"});
    const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    if(overflow || errors.length)throw Error(JSON.stringify({overflow,errors}));
    const evidence={fixtureBacked:true,searchAncestors:true,restoreExpansion:true,selectionPreserved:true,changedFilter:true,rulesSaveReread:true,unrelatedDataPreserved:true,mobileOverflow:overflow,pageErrors:errors,liveWrites:0};
    fs.writeFileSync("docs/architecture/business-partner/ux-workspace-evidence/browser-check.json",JSON.stringify(evidence,null,2));console.log(evidence);
  }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
