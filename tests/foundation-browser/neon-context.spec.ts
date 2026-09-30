import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { test, expect, type Page } from "@playwright/test";

const script = build({
  entryPoints: ["tooling/scripts/verification/neon-context-browser-entry.tsx"],
  bundle: true,
  write: false,
  loader: { ".css": "empty" },
  format: "iife",
  platform: "browser",
  jsx: "automatic",
});
const styles = [
  "packages/platform/foundation/theme/src/styles.css",
  "packages/platform/foundation/ui/src/styles.css",
  "packages/platform/shell/shell/src/styles.css",
  "packages/planes/neon/shell/src/styles.css",
]
  .map((path) => readFileSync(path, "utf8").replace(/@import[^;]+;/g, ""))
  .join("\n");
const catalog = {
  schemaVersion: 1,
  revision: "revision-one",
  tenantId: "tenant-a",
  supportsAllPermitted: true,
  companies: ["uk", "sg"].map((code) => ({
    companyCodeId: `${code}01`,
    code: `${code}01`,
    displayName: `${code} Company`,
    legalEntityId: code,
    legalEntityCode: `le-${code}`,
    legalEntityName: code === "uk" ? "UK Legal" : "Singapore Legal",
    functionalCurrency: "USD",
    capabilityGroups: ["procurement"],
  })),
};

async function mount(page: Page) {
  await page.route("http://context.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/neon/work-contexts"))
      { await new Promise(resolve => setTimeout(resolve, 120)); return route.fulfill({ json: catalog }); }
    if (path.endsWith("/neon/operating-organizations"))
      return route.fulfill({
        json: {
          schemaVersion: 1,
          revision: "orgs",
          tenantId: "tenant-a",
          effectiveAt: "2026-09-18T00:00:00Z",
          organizations: [],
        },
      });
    if (path.startsWith("/api/"))
      return route.fulfill({ status: 503, json: {} });
    return route.fulfill({
      contentType: "text/html",
      body: `<style>${styles}</style><div id="root"></div>`,
    });
  });
  await page.goto("http://context.test/");
  await page.evaluate(() =>
    localStorage.setItem(
      "athyper.neon.work-context.v1:tenant-a:principal-a",
      JSON.stringify({ mode: "company", companyCodeId: "uk01" }),
    ),
  );
  await page.addScriptTag({ content: (await script).outputFiles[0]!.text });
  await expect(page.getByTestId("scope")).toHaveText("uk / uk01");
}

async function chooseSingapore(page: Page) {
  await page
    .getByLabel("Legal entity: LE-UK · UK Legal", { exact: true })
    .click();
  await page.getByRole("radio", { name: /sg Company/ }).click();
}

test("switch cancellation preserves draft; commit resets content and is isolated from another tab", async ({
  page,
  context,
}) => {
  await mount(page);
  const other = await context.newPage();
  await mount(other);
  await page.getByLabel("Draft", { exact: true }).fill("Unsaved work");
  await chooseSingapore(page);
  await expect(
    page.getByRole("dialog", { name: "Discard unsaved changes?" }),
  ).toContainText("SG01 · sg Company (LE-SG · Singapore Legal)");
  await page.getByRole("button", { name: "Stay", exact: true }).click();
  await expect(page.getByTestId("scope")).toHaveText("uk / uk01");
  await expect(page.getByLabel("Draft", { exact: true })).toHaveValue(
    "Unsaved work",
  );
  await chooseSingapore(page);
  await page
    .getByRole("button", { name: "Discard and switch", exact: true })
    .click();
  await expect(page.getByTestId("scope")).toHaveText("sg / sg01");
  await expect(
    page.getByLabel("Legal entity: LE-SG · Singapore Legal", { exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel("Draft", { exact: true })).toHaveValue("");
  await expect(other.getByTestId("scope")).toHaveText("uk / uk01");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem(
            "athyper.neon.work-context.v1:tenant-a:principal-a",
          )!,
        ).companyCodeId,
    ),
  ).toBe("uk01");
});

test("running commands block a switch and keyboard dismissal restores focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 430, height: 850 });
  await mount(page);
  await page.getByLabel("Running command", { exact: true }).check();
  await chooseSingapore(page);
  await expect(
    page.getByRole("alert").filter({ hasText: "Finish the running command" }),
  ).toBeVisible();
  await expect(page.getByTestId("scope")).toHaveText("uk / uk01");
  await page.keyboard.press("Escape");
  await expect(
    page.getByLabel("Legal entity: LE-UK · UK Legal", { exact: true }),
  ).toBeFocused();
});

test("record boundary mounts once after initial context and reloads on a real company switch", async ({page}) => {
  let organizationRequests = 0;
  page.on("request", request => { if (new URL(request.url()).pathname.endsWith("/neon/operating-organizations")) organizationRequests++; });
  await mount(page);
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "contextContentMounts"))).toBe(1);
  await expect.poll(() => organizationRequests).toBe(1);
  await chooseSingapore(page);
  await expect(page.getByTestId("scope")).toHaveText("sg / sg01");
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "contextContentMounts"))).toBe(2);
});

for (const required of [false, true]) test(`entity record ${required ? "requires" : "ignores"} failed business context according to its descriptor`, async ({page}) => {
  let reads = 0, contexts = 0;
  const hash="a".repeat(64),entityCode=required?"scoped_record":"country";
  const revision={release:1,descriptorHash:hash,surfaceHash:hash};
  await page.route("http://context.test/**", async route => {
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/neon/work-contexts')){contexts++;return route.fulfill({status:503,json:{}});}
    if(path.endsWith('/application-descriptor')) return route.fulfill({json:{schemaVersion:1,plane:"neon",entity:{code:entityCode,label:"Records",pluralLabel:"Records"},revision,surface:{key:"entity_application",title:"Records"},actions:[],navigation:[],scope:{status:required?"context_required":"ready",labels:[],fingerprint:hash,...(required?{workContext:{schemaVersion:1,resolver:"platform.document_relationship.v1",requiredCoordinates:["legalEntityId"]}}:{})}}});
    if(path.endsWith('/detail')) {reads++;return route.fulfill({json:{schema:"athyper.entity-detail-read/1",descriptor:{schema:"athyper.entity-detail-descriptor/1",plane:"neon",entity:{code:entityCode,label:"Country",pluralLabel:"Countries"},revision,pageKind:"detail",titleField:"name",fields:[{key:"name",label:"Name",kind:"string",required:true,readOnly:true}],actions:[]},record:{id:"11111111-1111-4111-8111-111111111111",values:{name:"Malaysia"}}}});}
    if(path.startsWith('/api/')) return route.fulfill({status:503,json:{}});
    return route.fulfill({contentType:"text/html",body:`<style>${styles}</style><div id="root"></div>`});
  });
  await page.goto(`http://context.test/?entityFixture=${entityCode}`);
  await page.addScriptTag({content:(await script).outputFiles[0]!.text});
  if(required){
    await expect(page.getByRole('main').getByText('Work context is unavailable.')).toBeVisible();
    expect(reads).toBe(0);
    const before=contexts;
    await page.getByRole('main').getByRole('button',{name:'Try again'}).click();
    await expect.poll(()=>contexts).toBeGreaterThan(before);
  } else {
    await expect(page.getByText('Malaysia').first()).toBeVisible();
    expect(reads).toBe(1);
  }
});

test("related records use one detail request, published creation capability and locked parent membership", async ({page}) => {
  const paths: string[]=[];
  const hash="a".repeat(64),id="11111111-1111-4111-8111-111111111111",childId="22222222-2222-4222-8222-222222222222";
  const revision={release:1,descriptorHash:hash,surfaceHash:hash};
  await page.route("http://context.test/**", async route => {
    const url=new URL(route.request().url()),path=url.pathname;paths.push(path);
    if(path.endsWith('/neon/work-contexts'))return route.fulfill({json:catalog});
    if(path.endsWith('/application-descriptor')) return route.fulfill({json:{schemaVersion:1,plane:"neon",entity:{code:"principal",label:"Principal",pluralLabel:"Principals"},revision,surface:{key:"entity_application",title:"Principal"},actions:[],navigation:[],scope:{status:"ready",labels:[],fingerprint:hash}}});
    if(path.endsWith('/principal/records/'+id+'/detail'))return route.fulfill({json:{descriptor:{schema:"athyper.entity-detail-descriptor/1",plane:"neon",entity:{code:"principal",label:"Principal",pluralLabel:"Principals"},revision,pageKind:"detail",titleField:"name",fields:[{key:"name",label:"Name",kind:"string",required:true,readOnly:true}],actions:[],relationshipCapabilities:{profile:{create:false}},presentation:{schemaVersion:1,titleField:"name",sections:[{key:"overview",label:"Overview",fields:["name"]},{key:"profile",label:"Profile",fields:[],relationshipKey:"profile"}],entityRelationships:[{key:"profile",targetEntity:"principal_profile",cardinality:"zero_or_one",fields:[{source:"id",target:"principal_id"}],tenant:{source:"tenant_id",target:"tenant_id"},readOperation:"list"}]}},record:{id,values:{name:"Principal fixture"}}}});
    if(path.endsWith('/principal_profile/list')){
      expect(url.searchParams.get('parentEntityCode')).toBe('principal');
      expect(url.searchParams.get('parentRecordId')).toBe(id);
      expect(url.searchParams.get('relationshipKey')).toBe('profile');
      return route.fulfill({json:{schemaVersion:1,descriptorHash:hash,scopeFingerprint:hash,queryHash:hash,rows:[{id:childId,values:{name:"Profile fixture"}}],pagination:{pageSize:2,hasNext:false,hasPrevious:false,countMode:"none"}}});
    }
    if(path.endsWith('/principal_profile/records/'+childId+'/detail'))return route.fulfill({json:{descriptor:{schema:"athyper.entity-detail-descriptor/1",plane:"neon",entity:{code:"principal_profile",label:"Profile",pluralLabel:"Profiles"},revision,pageKind:"detail",titleField:"name",fields:[{key:"name",label:"Name",kind:"string",required:true,readOnly:true}],actions:[]},record:{id:childId,values:{name:"Profile fixture"}}}});
    if(path.startsWith('/api/'))return route.fulfill({status:503,json:{}});
    return route.fulfill({contentType:"text/html",body:`<style>${styles}</style><div id="root"></div>`});
  });
  await page.goto('http://context.test/?entityFixture=principal');
  await page.addScriptTag({content:(await script).outputFiles[0]!.text});
  await page.getByRole('navigation',{name:'Record sections'}).getByRole('button',{name:'Profile',exact:true}).click();
  await expect(page.getByText('Profile fixture')).toBeVisible();
  expect(paths.filter(path=>path.endsWith('/principal_profile/records/'+childId+'/detail'))).toHaveLength(1);
  expect(paths.some(path=>path.endsWith('/form-descriptor')||path.endsWith('/detail-descriptor')||path.endsWith('/records/'+childId))).toBe(false);
});
