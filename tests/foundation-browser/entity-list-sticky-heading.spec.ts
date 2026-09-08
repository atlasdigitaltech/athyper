import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, test } from "@playwright/test";

const source = readFileSync("packages/platform/entity/runtime/list-view/src/sticky-table-header.ts", "utf8");
const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace("export function attachStickyTableHeader", "window.attachStickyTableHeader = function");
const styles = ["packages/platform/shell/shell/src/styles.css", "packages/platform/entity/runtime/list-view/src/styles.css"].map(path => readFileSync(path,"utf8").replace(/^@import[^;]+;/mg, "")).join("\n");

test("headings follow the toolbar, remain aligned and interactive, and stop at the table end", async ({page}) => {
  await page.setViewportSize({width:1100,height:700});
  await page.setContent(`<style>${styles}
  body{margin:0}.athyper-shell{--a-space-2:8px;--a-space-3:12px;--a-space-4:16px;--a-space-6:24px;--a-border-width:1px;--a-border:#ccc;--a-surface:white;--a-background:#fafafa;--a-muted:#eee;--a-z-overlay:40}
  .athyper-shell__main{padding:24px}.intro{height:250px}.a-entity-list__chrome{height:64px}.a-entity-list__table{min-width:1200px}.a-entity-list__table td{height:60px}.after{height:900px}
  </style><div class="athyper-shell"><header class="athyper-shell__topbar">Main header</header><div class="athyper-shell__body"><nav class="athyper-shell__breadcrumbs">Breadcrumb</nav><main class="athyper-shell__main"><div class="intro">Entity header</div><div class="a-entity-list__panel"><div class="a-entity-list__chrome">Search and filters</div><div class="a-entity-list__table-wrap a-entity-list__table-wrap--sticky-heading"><table class="a-entity-list__table"><thead><tr><th><button id="sort" onclick="this.dataset.clicked='true'">Code</button></th><th>Name</th><th>Status</th></tr></thead><tbody>${Array.from({length:20},(_,i)=>`<tr><td>Code ${i}</td><td>Name ${i}</td><td>Active</td></tr>`).join("")}</tbody></table></div><div>Pagination</div></div><div class="after"></div></main></div></div>`);
  await page.addScriptTag({content:script});
  await page.evaluate(() => (window as unknown as {attachStickyTableHeader:(wrapper:HTMLElement)=>void}).attachStickyTableHeader(document.querySelector('.a-entity-list__table-wrap')!));
  const head=page.locator('thead'), toolbar=page.locator('.a-entity-list__chrome');
  const gap=async()=> (await head.boundingBox())!.y-((await toolbar.boundingBox())!.y+(await toolbar.boundingBox())!.height);
  await page.evaluate(()=>window.scrollTo(0,500));
  await expect.poll(gap).toBeCloseTo(0,0);
  await page.locator('#sort').click();
  await expect(page.locator('#sort')).toHaveAttribute('data-clicked','true');
  await toolbar.evaluate(element => (element as HTMLElement).style.height='112px');
  await expect.poll(gap).toBeCloseTo(0,0);
  await page.locator('.a-entity-list__table-wrap').evaluate(element => element.scrollLeft=150);
  const headerCell=await page.locator('thead th').first().boundingBox(), dataCell=await page.locator('tbody td').first().boundingBox();
  expect(headerCell!.x).toBeCloseTo(dataCell!.x,0);
  expect(headerCell!.width).toBeCloseTo(dataCell!.width,0);
  await page.evaluate(()=>{const table=document.querySelector('table')!;window.scrollTo(0,window.scrollY+table.getBoundingClientRect().bottom-120);});
  await expect.poll(async()=> {const header=await head.boundingBox(), table=await page.locator('table').boundingBox(); return header!.y+header!.height-table!.y-table!.height;}).toBeCloseTo(0,0);
  await page.setViewportSize({width:600,height:700});
  await expect.poll(()=>head.evaluate(element=>getComputedStyle(element).position)).toBe('absolute');
  await expect.poll(()=>head.evaluate(element=>getComputedStyle(element).transform)).toBe('none');
});
