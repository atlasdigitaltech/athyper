import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { withSessionDefaults } from "./fixtures/session-stub";

// The shared related-record section pattern (one record and child lists), rendered with
// the real stylesheets in each mode a record section can be in.
const bundle = build({
  stdin: { loader: "tsx", resolveDir: process.cwd(), contents: `
    import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {RelatedSection,EntityRelatedSection} from './packages/platform/entity/runtime/form-detail/src/related-entity-section';
    import {Button,Card} from './packages/platform/foundation/ui/src/index';
    import {IntlProvider} from './packages/platform/foundation/i18n/src/react';
    import {createEffectiveLocalization} from './packages/platform/foundation/i18n/src/index';
    import {entityMessages,entityFallbackMessages} from './packages/platform/foundation/i18n/src/entity-catalogs';
    function Mode(){
      const mode=window.mode;
      const back={label:'Notifications',onBack:()=>{window.events.push('back')}};
      const form=<form><label>Event<input name="event"/></label><label>Channel<select><option>In app</option></select></label><div className="a-entity-form-actions"><Button type="submit" size="small">Save preference</Button><Button type="button" variant="secondary" size="small">Cancel</Button></div></form>;
      if(mode==='real-empty'){
        const t=(key,en,ms)=>window.localized?{labelKey:key,defaultText:en,defaultLocale:'en',values:{en,ms}}:en;
        const state={message:t('p.message','Add the names shown across the platform.','Tambah nama yang dipaparkan di seluruh platform.'),setupLabel:t('p.setup','Set up profile','Sediakan profil'),editLabel:'Edit profile',creation:'on_save',...(window.withTitle?{title:t('p.title','Set up your profile','Sediakan profil anda')}:{})};
        const descriptor={entity:{code:'principal'},revision:{descriptorHash:'a'.repeat(64)},presentation:{entityRelationships:[{key:'profile',targetEntity:'principal_profile',cardinality:'zero_or_one',fields:[{source:'id',target:'principal_id'}],tenant:{source:'tenant_id',target:'tenant_id'},readOperation:'list',emptyState:state}]}};
        return <Card className="a-record-detail-content"><h2>Profile</h2><EntityRelatedSection descriptor={descriptor} ownerRecordId="cca94907-7519-5871-8e3c-6b11aa545c93" relationshipKey="profile" canCreate sectionLabel="Profile" sectionIconKey={window.iconKey}/></Card>;
      }
      return <Card className="a-record-detail-content"><h2>{mode==='one'||mode==='empty'?'Profile':'Notifications'}</h2>
        {mode==='one'?<RelatedSection actions={<Button size="small" variant="secondary">Edit</Button>}><dl className="a-record-detail-fields"><div><dt>Given name</dt><dd>Catl</dd></div></dl></RelatedSection>:null}
        {mode==='empty'?<RelatedSection actions={<Button size="small">Set up profile</Button>}><p className="a-related-section__empty">Profile has not been set up.</p></RelatedSection>:null}
        {mode==='child'?<RelatedSection crumb={{back,current:'Mentioned in a comment'}} saved actions={<Button size="small" variant="secondary">Edit</Button>}><dl className="a-record-detail-fields"><div><dt>Channel</dt><dd>In app</dd></div></dl></RelatedSection>:null}
        {mode==='edit'?<RelatedSection crumb={{back,current:'Edit · Mentioned in a comment'}} editing onEscape={()=>window.events.push('escape')}>{form}</RelatedSection>:null}
      </Card>;
    }
    const locale=window.locale??'en';
    createRoot(document.getElementById('root')).render(<IntlProvider localization={createEffectiveLocalization({uiLocale:locale,formatLocale:locale,timeZone:'UTC'})} messages={entityMessages(locale)} fallbackMessages={entityFallbackMessages}><Mode/></IntlProvider>);
  ` },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", loader: { ".css": "empty" },
  tsconfig: resolve("tooling/config/tsconfig-react.json"), define: { "process.env.NODE_ENV": '"test"' },
  plugins: [{ name: "session-fixture", setup(builder) {
    builder.onResolve({ filter: /^@athyper\/platform-shell-app-foundation$/ }, () => ({ path: "session", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: withSessionDefaults(`
      export const useApiClient=()=>({request:async()=>({rows:[],pagination:{hasNext:false}})});
      export const useApplicationNavigation=()=>({push(){},replace(){},refresh(){}});
      export const useSessionIdentity=()=>({state:'authenticated',scope:{tenantId:'t',principalId:'actor',authEpoch:1}});
      export const useExperienceRevision=()=>({state:'ready',revision:'release'});
      export const usePermissions=()=>[];
      export const useToasts=()=>({push:()=>{}});
      export const useOptionalAppearanceProfile=()=>undefined;
      export const readBrowserCsrfToken=()=>undefined;
      export const ErrorSurface=()=>null;
    `), loader: "js" }));
  } }],
}).then(r => r.outputFiles[0]!.text);
const styles = ["packages/platform/foundation/theme/src/styles.css", "packages/platform/foundation/ui/src/styles.css", "packages/platform/shell/shell/src/styles.css", "packages/platform/entity/runtime/form-detail/src/styles.css"].map(path => readFileSync(path, "utf8").replace(/^@import[^;]+;/mg, "")).join("\n");
async function mount(page: import("@playwright/test").Page, mode: string, width = 1280, extra: Record<string, unknown> = {}) {
  await page.setViewportSize({ width, height: 800 });
  await page.route("https://section.test/**", route => route.fulfill({ contentType: "text/html", body: "<html></html>" }));
  await page.goto("https://section.test/");
  await page.setContent('<!doctype html><html data-density="comfortable"><body><div id="root" style="padding:16px"></div></body></html>');
  await page.addStyleTag({ content: styles });
  await page.evaluate(({ mode, extra }) => Object.assign(window, { mode, events: [] }, extra), { mode, extra });
  await page.addScriptTag({ content: await bundle });
  await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
}
const row = (page: import("@playwright/test").Page, name: string) => page.evaluate((name) => {
  const heading = document.querySelector("h2")!.getBoundingClientRect();
  const button = [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === name)!.getBoundingClientRect();
  return { sameRow: Math.abs((heading.top + heading.bottom) / 2 - (button.top + button.bottom) / 2) <= 2, endEdge: button.right > heading.right, height: Math.round(button.height) };
}, name);

test("section actions sit on the heading's row at the end edge, small, one primary", async ({ page }) => {
  for (const [mode, action] of [["one", "Edit"], ["empty", "Set up profile"], ["child", "Edit"]] as const) {
    await mount(page, mode);
    const geometry = await row(page, action);
    expect(geometry.sameRow).toBe(true);
    expect(geometry.endEdge).toBe(true);
    expect(await page.locator(".a-button--primary").count()).toBeLessThanOrEqual(1);
  }
});

test("a child record shows a back link naming the list, not a Back button beside the actions", async ({ page }) => {
  await mount(page, "child");
  const crumb = page.getByRole("navigation", { name: "Back to Notifications" });
  await expect(crumb.getByRole("button", { name: "Notifications" })).toBeVisible();
  await expect(crumb.locator("[aria-current=page]")).toHaveText("Mentioned in a comment");
  await expect(page.getByRole("button", { name: /Back to list/ })).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("Saved");
  await crumb.getByRole("button", { name: "Notifications" }).click();
  expect(await page.evaluate(() => (window as any).events)).toEqual(["back"]);
});

test("editing: first field focused, one Save / Cancel row, Esc leaves like Cancel", async ({ page }) => {
  await mount(page, "edit");
  await expect(page.getByRole("textbox", { name: "Event" })).toBeFocused();
  const actions = page.locator(".a-entity-form-actions");
  await expect(actions.getByRole("button")).toHaveText(["Save preference", "Cancel"]);
  // No second exit above the form.
  await expect(page.getByRole("button", { name: /Back to list/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => (window as any).events)).toEqual(["escape"]);
});

test("on phones the Save / Cancel row stays at the bottom of the screen while editing", async ({ page }) => {
  await mount(page, "edit", 390);
  expect(await page.locator(".a-entity-form-actions").evaluate((node) => getComputedStyle(node).position)).toBe("sticky");
});

test("an empty one-record section uses the shared empty state from metadata, action inside it", async ({ page }) => {
  await mount(page, "real-empty", 1280, { withTitle: true, iconKey: "user" });
  const empty = page.locator(".a-related-section__empty-state");
  await expect(empty.getByRole("heading", { level: 3 })).toHaveText("Set up your profile");
  await expect(empty.locator("p")).toHaveText("Add the names shown across the platform.");
  await expect(empty.getByRole("button", { name: "Set up profile" })).toBeVisible();
  // One call to action: nothing on the heading row while empty.
  await expect(page.locator(".a-related-section__actions")).toHaveCount(0);
  // Same anatomy as the Files empty state: centred, icon in a circle.
  expect(await empty.evaluate((node) => getComputedStyle(node).textAlign)).toBe("center");
  await expect(empty.locator(".a-panel-empty-state__icon svg")).toHaveCount(1);
});

test("without a published title the message is the heading and the icon falls back", async ({ page }) => {
  await mount(page, "real-empty", 1280, { withTitle: false });
  const empty = page.locator(".a-related-section__empty-state");
  await expect(empty.getByRole("heading", { level: 3 })).toHaveText("Add the names shown across the platform.");
  await expect(empty.locator("p")).toHaveCount(0);
  await expect(empty.locator(".a-panel-empty-state__icon svg")).toHaveCount(1);
});

test("published empty-state translations render in the person's language", async ({ page }) => {
  await mount(page, "real-empty", 1280, { withTitle: true, localized: true, locale: "ms", iconKey: "user" });
  const empty = page.locator(".a-related-section__empty-state");
  await expect(empty.getByRole("heading", { level: 3 })).toHaveText("Sediakan profil anda");
  await expect(empty.locator("p")).toHaveText("Tambah nama yang dipaparkan di seluruh platform.");
  await expect(empty.getByRole("button", { name: "Sediakan profil" })).toBeVisible();
});
