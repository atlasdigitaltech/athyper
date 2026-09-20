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
          {['activity', 'banking', 'overview'].map(key => <button key={key} onClick={() => {
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
      ? `export const useApiClient = () => ({}); export const useSessionIdentity = () => ({});`
      : `import {useState} from 'react';
         const keys = ['overview', 'contacts', 'banking', 'activity'];
         const bootstrap = {header:{values:{},revision:'1'}, plan:{actions:[], sections:keys.map(key=>({key,label:{defaultText:key}})),navigation:{tabs:[{key:'360',provider:'360',sectionKeys:keys.slice(0,3)}]}}};
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

test("returning from Activity to Banking scrolls the newly mounted 360 document", async ({page}) => {
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
