import { build } from "esbuild";
import { test, expect } from "@playwright/test";
import { withSessionDefaults } from "./fixtures/session-stub";
import { planeStyles } from "./fixtures/app-styles";
const script = build({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{EntityReferencePreviewProvider,ReferenceOrigin}from'./packages/platform/entity/runtime/form-detail/src/reference-preview';
import{EntityRecordFields}from'./packages/platform/entity/runtime/form-detail/src/record-fields';
const ref={entityCode:'country',recordId:'10000000-0000-4000-8000-000000000001',value:'AE',label:'United Arab Emirates'};
const source={schema:'athyper.entity-detail-descriptor/1',entity:{code:'state_region',label:'State/Region',pluralLabel:'States and regions'},fields:[{key:'country_code',label:'Country',kind:'string'}]};
window.source={descriptor:source,record:{id:'10000000-0000-4000-8000-000000000002',values:{country_code:'AE'},references:{country_code:ref}}};
window.target={descriptor:{...source,entity:{code:'country',label:'Country',pluralLabel:'Countries'},titleField:'name',fields:[{key:'name',label:'Name',kind:'string'},{key:'code',label:'Code',kind:'string'},{key:'extra',label:'Extra field',kind:'string'}],referenceSummaryFields:['name','code']},record:{id:ref.recordId,values:{name:'United Arab Emirates',code:'AE',extra:'Not a summary field'}}};
function App(){const[n,set]=useState(0);window.switchContext=()=>{window.scope='other';set(n+1)};const fields=<EntityRecordFields descriptor={source} record={window.source.record} fieldKeys={['country_code']}/>;return <EntityReferencePreviewProvider sourceKey='state-region-record'>{window.origin?<ReferenceOrigin recordTitle={window.origin.record}><ReferenceOrigin sectionLabel={window.origin.section}>{fields}</ReferenceOrigin></ReferenceOrigin>:fields}</EntityReferencePreviewProvider>};createRoot(document.getElementById('root')).render(<App/>);
`,
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  loader: { ".css": "empty" },
  plugins: [
    {
      name: "session",
      setup(builder) {
        builder.onResolve(
          { filter: /^@athyper\/platform-shell-app-foundation$/ },
          () => ({ path: "session", namespace: "fixture" }),
        );
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          loader: "js",
          contents: withSessionDefaults(`
const http={request:async(_,input)=>{const entity=input.params.entityCode;window.reads=[...(window.reads??[]),entity];input.signal?.addEventListener('abort',()=>window.aborted=true);if(entity==='state_region'){if(window.sourceDenied)throw Error('denied');return window.source;}if(window.targetDenied)throw Error('denied');if(window.delay)await new Promise(resolve=>window.finish=resolve);return window.target;}};
export const useApiClient=()=>http;export const useSessionIdentity=()=>({state:'authenticated',scope:{tenantId:window.scope??'tenant',principalId:'actor'}});export const useApplicationNavigation=()=>({push:href=>window.navigated=href});export const useToasts=()=>({push(){}});export const useOptionalAppearanceProfile=()=>undefined;export const readBrowserCsrfToken=()=>undefined;
`),
        }));
      },
    },
  ],
}).then((r) => r.outputFiles[0]!.text);
async function mount(page: import("@playwright/test").Page, width = 1440, origin?: { record: string; section: string }) {
  await page.setViewportSize({ width, height: 900 });
  await page.route("http://preview.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
  );
  await page.goto("http://preview.test/");
  await page.addStyleTag({ content: planeStyles() });
  if (origin) await page.evaluate((value) => { (window as any).origin = value; }, origin);
  await page.addScriptTag({ content: await script });
}
const panel = (page: import("@playwright/test").Page) =>
  page.locator(".a-entity-reference-preview");
test("reference opens authorized summary, preserves href, pins and opens the standard record", async ({
  page,
}) => {
  await mount(page);
  const link = page.getByRole("link", { name: "Preview United Arab Emirates" });
  await expect(link).toHaveAttribute(
    "href",
    "/app/entity/country/10000000-0000-4000-8000-000000000001",
  );
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(
    panel(page).getByText("United Arab Emirates", { exact: true }),
  ).toBeVisible();
  await expect(panel(page).getByText("Not a summary field")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).reads)).toEqual([
    "state_region",
    "country",
  ]);
  await panel(page)
    .getByRole("button", { name: "Pin panel to the side" })
    .click();
  await expect(panel(page)).toHaveAttribute("role", "region");
  await panel(page).getByRole("button", { name: "Unpin panel" }).click();
  await expect(panel(page)).toHaveAttribute("role", "dialog");
  // Shared panel anatomy: entity icon tile, context row naming the source, pinned footer action.
  await expect(panel(page).locator(".a-panel-header__icon svg")).toHaveCount(1);
  await expect(panel(page).locator(".a-panel-context")).toContainText("›");
  const open = panel(page).locator(".a-entity-reference-preview__footer").getByRole("link", { name: /^Open / });
  await expect(open).toBeVisible();
  await expect(panel(page).locator(".a-entity-reference-preview__body").getByRole("link")).toHaveCount(0);
  await open.click();
  await expect
    .poll(() => page.evaluate(() => (window as any).navigated))
    .toBe("/app/entity/country/10000000-0000-4000-8000-000000000001");
  await expect(panel(page)).toHaveCount(0);
});
for (const side of ["source", "target"])
  test(
    side + " denial never displays preview values or an open action",
    async ({ page }) => {
      await mount(page);
      await page.evaluate((side) => {
        (window as any)[side + "Denied"] = true;
      }, side);
      await page
        .getByRole("link", { name: "Preview United Arab Emirates" })
        .click();
      await expect(panel(page).getByRole("alert")).toContainText("unavailable");
      await expect(
        panel(page).getByRole("link", { name: "Open record" }),
      ).toHaveCount(0);
      await expect(
        panel(page).getByText("United Arab Emirates", { exact: true }),
      ).toHaveCount(0);
    },
  );
test("context change closes preview and discards a late response", async ({
  page,
}) => {
  await mount(page);
  await page.evaluate(() => {
    (window as any).delay = true;
  });
  await page
    .getByRole("link", { name: "Preview United Arab Emirates" })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).reads?.length))
    .toBe(2);
  await page.evaluate(() => {
    (window as any).switchContext();
  });
  await expect(panel(page)).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).finish();
  });
  expect(await page.evaluate(() => (window as any).aborted)).toBe(true);
  await expect(panel(page)).toHaveCount(0);
});
test("mobile uses a full-width drawer and close restores focus", async ({
  page,
}) => {
  await mount(page, 390);
  const link = page.getByRole("link", { name: "Preview United Arab Emirates" });
  await link.click();
  await expect(panel(page)).toHaveAttribute("role", "dialog");
  await expect(
    panel(page).getByRole("button", { name: "Pin panel to the side" }),
  ).toHaveCount(0);
  expect(Math.round((await panel(page).boundingBox())!.width)).toBe(390);
  await panel(page)
    .getByRole("button", { name: "Close reference preview", exact: true })
    .click();
  await expect(link).toBeFocused();
});

test("reference values: no underline at rest, underline and cue on hover or focus, no shift", async ({ page }) => {
  await mount(page);
  const link = page.getByRole("link", { name: "Preview United Arab Emirates" });
  const state = () => link.evaluate((node) => {
    const cue = node.querySelector(".a-entity-reference-link__cue")!;
    return { underline: getComputedStyle(node).textDecorationLine, width: Math.round(node.getBoundingClientRect().width), weight: getComputedStyle(node).fontWeight, cue: getComputedStyle(cue).opacity };
  });
  const rest = await state();
  expect(rest.underline).toBe("none");
  await link.hover();
  await expect.poll(async () => (await state()).cue).toBe("1");
  const hover = await state();
  expect(hover.underline).toBe("underline");
  expect([hover.width, hover.weight]).toEqual([rest.width, rest.weight]);
  await page.mouse.move(0, 0);
  await link.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  expect((await state()).underline).toBe("underline");
});

test("Esc closes the preview and returns focus to the reference that opened it", async ({ page }, info) => {
  await mount(page);
  const link = page.getByRole("link", { name: "Preview United Arab Emirates" });
  await link.click();
  await expect(panel(page).locator(".a-entity-reference-preview__footer")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(link).toBeFocused();
});

test("the preview's footer action is pinned to the panel's bottom edge", async ({ page }) => {
  await mount(page);
  await page.getByRole("link", { name: "Preview United Arab Emirates" }).click();
  const footer = (await panel(page).locator(".a-entity-reference-preview__footer").boundingBox())!;
  const box = (await panel(page).boundingBox())!;
  expect(Math.abs(footer.y + footer.height - (box.y + box.height))).toBeLessThanOrEqual(1);
});

test("the context row reads like the breadcrumb: record › section › field", async ({ page }) => {
  await mount(page, 1440, { record: "Dubai", section: "Location" });
  await page.getByRole("link", { name: "Preview United Arab Emirates" }).click();
  const row = panel(page).locator(".a-entity-reference-preview__origin");
  await expect(row.locator(".a-entity-reference-preview__origin-part")).toHaveText(["Dubai", "Location", await panel(page).locator(".a-entity-reference-preview__origin-part").last().innerText()]);
  await expect(row).toHaveAttribute("title", /^From Dubai › Location › /);
});

test("without a record page around it the row falls back to entity › field", async ({ page }) => {
  await mount(page);
  await page.getByRole("link", { name: "Preview United Arab Emirates" }).click();
  const parts = panel(page).locator(".a-entity-reference-preview__origin-part");
  await expect(parts).toHaveCount(2);
});

test("on a narrow panel the record title gives way first; section and field stay whole", async ({ page }) => {
  await mount(page, 390, { record: "A very long record title that cannot possibly fit in a phone-width panel row", section: "Location" });
  await page.getByRole("link", { name: "Preview United Arab Emirates" }).click();
  const parts = panel(page).locator(".a-entity-reference-preview__origin-part");
  const clipped = await parts.evaluateAll((nodes) => nodes.map((node) => node.scrollWidth > node.clientWidth + 1));
  expect(clipped).toEqual([true, false, false]);
});
