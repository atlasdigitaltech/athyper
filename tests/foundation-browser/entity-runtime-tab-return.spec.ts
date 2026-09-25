import { build } from "esbuild";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// Exercise the real workspace and its scroll effects; only resource loading and
// shell providers are replaced so the navigation race is deterministic.
const bundle = build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React, { useRef, useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { EntityRuntimeWorkspace } from './packages/platform/entity/runtime/form-detail/src/entity-runtime-workspace';
    function Fixture() {
      const [tab, setTab] = useState('activity');
      const [section, setSection] = useState('activity');
      const scrollRoot = useRef(null);
      return <EntityRuntimeWorkspace entityCode="partner" recordId="record" surfaceKey="detail"
        deepLinkedSectionKey={section} continuousSections={tab === '360'} continuousScrollRoot={scrollRoot}
        sectionNavigation="header" onSelectSection={setSection} onObserveSection={setSection}
        renderSection={({sectionKey}) => <div style={{height: 400}}>{sectionKey} data</div>}
        renderHeader={(_, __, ___, navigation) => <nav>
          {['activity', 'banking', 'overview', 'policy', 'limits'].map(key => <button key={key} onClick={() => {
            navigation.onSelectSection(key);
            setTab(key === 'activity' ? 'activity' : '360');
          }}>{key}</button>)}
          <output>{navigation.activeSection}</output>
        </nav>}
        renderBody={({content}) => <div id="content" ref={scrollRoot} style={{height: 300, overflowY: 'auto'}}>{content}</div>}
      />;
    }
    createRoot(document.getElementById('root')).render(<Fixture />);
  ` },
  plugins: [{ name: "workspace-resources", setup(builder) {
    builder.onResolve({ filter: /use-section-resource$/ }, () => ({ path: "resources", namespace: "fixture" }));
    builder.onResolve({ filter: /^@athyper\/platform-shell-app-foundation$/ }, () => ({ path: "shell", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({path}) => ({ loader: "tsx", resolveDir: process.cwd(), contents: path === "shell"
      ? `export const useApiClient = () => ({}); export const useSessionIdentity = () => ({}); export const useToasts = () => ({push:()=>{}}); export const readBrowserCsrfToken = () => undefined;`
      : `import {useState} from 'react';
         const keys = ['overview', 'contacts', 'banking', 'activity', 'policy', 'limits'];
         const bootstrap = {header:{values:{},revision:'1'}, plan:{actions:[], sections:keys.map(key=>({key,label:{defaultText:key}})),navigation:{tabs:[{key:'360',provider:'overview',sectionDisplay:'continuous',label:{defaultText:'Record'},sectionKeys:keys.slice(0,3)},{key:'arbitrary-group',provider:'section',sectionDisplay:'continuous',label:{defaultText:'Policy'},sectionKeys:['policy','limits']}]}}};
         const sections = Object.fromEntries(keys.map(key=>[key,{status:'ready',resource:{}}]));
         export function useEntityRuntimeSectionWorkspace() {
           const [activeSectionKey, selectSection] = useState('activity');
           return {bootstrap,bootstrapStatus:'ready',sections,activeSectionKey,selectSection,observeSection:selectSection,preloadSection:()=>{},retrySection:()=>{},invalidate:()=>{},loadMore:()=>{}};
         }`
    }));
  }}],
  bundle: true, write: false, outfile: "fixture.js", format: "iife", platform: "browser", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"test"' }, tsconfig: resolve("tooling/config/tsconfig-react.json"), logLevel: "silent",
}).then(result => result.outputFiles.find(file => file.path.endsWith('.js'))!.text);

test("returning from Activity to Banking jumps directly in the newly mounted record document", async ({page}) => {
  await page.setContent('<style>.a-runtime-continuous-sections__tail{height:400px}h2{margin:0}</style><div id="root"></div>');
  await page.addScriptTag({content: await bundle});
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole('button', {name:'banking', exact:true}).click();
    await expect.poll(() => page.locator('#entity-runtime-section-banking').evaluate(el =>
      Math.abs(el.getBoundingClientRect().top - document.getElementById('content')!.getBoundingClientRect().top)
    )).toBeLessThan(3);
    await expect(page.locator('output')).toHaveText('banking');
    await page.getByRole('button', {name:'activity', exact:true}).click();
    await expect(page.locator('#content')).toHaveText('activity data');
  }
  await page.getByRole('button', {name:'overview', exact:true}).click();
  await expect(page.locator('output')).toHaveText('overview');
  await expect.poll(() => page.locator('#content').evaluate(el => el.scrollTop)).toBe(0);
});

test("metadata gives another tab the same continuous navigation without rendering other groups", async ({page}) => {
  await page.setContent('<style>.a-runtime-continuous-sections__tail{height:400px}h2{margin:0}</style><div id="root"></div>');
  await page.addScriptTag({content: await bundle});
  await page.getByRole('button', {name:'limits', exact:true}).click();
  await expect(page.locator('#entity-runtime-heading-limits')).toBeFocused();
  await expect(page.locator('#entity-runtime-section-policy')).toHaveCount(1);
  await expect(page.locator('#entity-runtime-section-banking')).toHaveCount(0);
  await page.locator('#content').hover();
  await page.mouse.wheel(0, -800);
  await expect(page.locator('output')).toHaveText('policy');
  await page.getByRole('button', {name:'banking', exact:true}).click();
  await expect(page.locator('#entity-runtime-heading-banking')).toBeFocused();
  await expect(page.locator('#entity-runtime-section-policy')).toHaveCount(0);
});

test("explicit navigation never animates and focuses the destination heading", async ({page}) => {
  await page.setContent('<style>#content{scroll-behavior:smooth}.a-runtime-continuous-sections__tail{height:400px}h2{margin:0}</style><div id="root"></div>');
  await page.evaluate(() => {
    const original = Element.prototype.scrollTo;
    (window as any).scrollBehaviors = [];
    Element.prototype.scrollTo = function (...args: any[]) {
      (window as any).scrollBehaviors.push(args[0]?.behavior);
      return (original as any).apply(this, args);
    };
  });
  await page.addScriptTag({content: await bundle});
  await page.getByRole('button', {name:'banking', exact:true}).click();
  await expect(page.locator('#entity-runtime-heading-banking')).toBeFocused();
  await expect.poll(() => page.locator('#content').evaluate(el => el.scrollTop)).toBeGreaterThan(700);
  const behaviors = await page.evaluate(() => (window as any).scrollBehaviors);
  expect(behaviors.length).toBeGreaterThan(0);
  expect(behaviors.every((behavior: string) => behavior === 'instant')).toBe(true);
  await expect(page.locator('output')).toHaveText('banking');
});

test("late preceding content stays anchored until the user takes control", async ({page}) => {
  await page.setContent('<style>.a-runtime-continuous-sections__tail{height:400px}h2{margin:0}</style><div id="root"></div>');
  await page.addScriptTag({content: await bundle});
  await page.getByRole('button', {name:'banking', exact:true}).click();
  await expect(page.locator('#entity-runtime-heading-banking')).toBeFocused();
  await page.locator('#entity-runtime-section-contacts').evaluate(el => { el.style.height = '1000px'; });
  await expect.poll(() => page.locator('#entity-runtime-section-banking').evaluate(el =>
    Math.abs(el.getBoundingClientRect().top - document.getElementById('content')!.getBoundingClientRect().top)
  )).toBeLessThan(3);
  await expect(page.locator('output')).toHaveText('banking');
  await page.locator('#content').hover();
  await page.mouse.wheel(0, -600);
  await expect.poll(() => page.locator('#entity-runtime-section-banking').evaluate(el =>
    el.getBoundingClientRect().top - document.getElementById('content')!.getBoundingClientRect().top
  )).toBeGreaterThan(100);
});
