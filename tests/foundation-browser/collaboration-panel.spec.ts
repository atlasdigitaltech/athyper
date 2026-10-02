import { buildSync } from "esbuild";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const css = [
  "packages/platform/foundation/theme/src/styles.css",
  "packages/platform/foundation/ui/src/styles.css",
  "packages/platform/shell/shell/src/styles.css",
  "packages/platform/entity/runtime/form-detail/src/styles.css",
]
  .map((path) => readFileSync(path, "utf8").replace(/@import[^;]+;/g, ""))
  .join("\n");
const bundle = buildSync({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
import React,{useState,useContext} from 'react';import{createRoot}from'react-dom/client';
import{PanelHeader}from'@athyper/platform-ui';
import{EntityCollaborationSurface}from'./packages/platform/entity/runtime/form-detail/src/collaboration-surface';
import{WorkspaceSidePanelContext}from'./packages/platform/shell/shell/src/workspace-side-panel';
import{CollaborationToolbarContext}from'./packages/platform/entity/runtime/form-detail/src/collaboration-visibility';
function Content({name}){const toolbar=useContext(CollaborationToolbarContext);const[value,setValue]=useState('');return <div><label>{name}<input value={value} onChange={event=>setValue(event.target.value)}/></label>{name==='comments'?<div data-testid='comment-toolbar' ref={toolbar}/>:null}</div>}
function App(){const[full,setFull]=useState(false);const[open,setOpen]=useState(true),[pinned,setPinned]=useState(true),[active,setActive]=useState('comments'),[owner,setOwner]=useState();const claim=React.useCallback(panel=>setOwner(panel.id),[]),release=React.useCallback(id=>setOwner(current=>current===id?undefined:current),[]);return <WorkspaceSidePanelContext.Provider value={{owner,claim,release}}><button onClick={()=>setOwner('atlas')}>Atlas</button><button onClick={()=>{setOpen(true);window.dispatchEvent(new CustomEvent('athyper:collaboration-open'))}}>Open comments</button><main><label hidden={full}>Record name<input defaultValue="Saved name"/></label><nav><button onClick={()=>setActive("comments")}>Record Comments</button><button onClick={()=>setActive("attachments")}>Record Files</button></nav><EntityCollaborationSurface recordEditing fullView={full} onFullViewChange={setFull} open={open} pinned={pinned} activeSectionKey={active} sections={[{key:'comments',label:'Comments'},{key:'attachments',label:'Files'}]} onOpenChange={setOpen} onPinnedChange={setPinned} onActiveSectionChange={setActive} preloadSection={()=>{}} renderSection={key=><Content name={key}/>}/></main></WorkspaceSidePanelContext.Provider>}
createRoot(document.getElementById('root')).render(<App/>);
window.mountAtlasReference=()=>{const node=document.createElement('section');node.className='athyper-atlas-workspace a-context-panel';document.body.append(node);createRoot(node).render(<PanelHeader className='athyper-atlas-workspace__header' title='Atlas AI' subtitle='Neon · Workspace assistant' icon={<span>A</span>} actions={<button>×</button>}/>)};
`,
  },
  alias: {
    "@athyper/platform-ui": resolve(
      "packages/platform/foundation/ui/src/index.tsx",
    ),
    // Shell subpaths resolve from source (the panel imports "@athyper/platform-shell/tool-panel").
    "@athyper/platform-shell": resolve("packages/platform/shell/shell/src"),
  },
  loader: { ".css": "empty" },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  nodePaths: ["apps/neon/node_modules"],
}).outputFiles[0]!.text;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(
    `<html><head><style>${css}</style></head><body><div id="root"></div></body></html>`,
  );
  await page.evaluate(bundle);
});
test("one draft survives display modes, tabs, Atlas handoff and close/reopen", async ({
  page,
}) => {
  const panel = page.getByRole("region", { name: "Collaboration" });
  await expect(panel).toHaveAttribute("data-mode", "pinned");
  const editor = page.getByLabel("comments", { exact: true });
  await editor.fill("Unsaved draft");
  await page
    .getByRole("button", { name: "Open collaboration in full view" })
    .click();
  await expect(panel).toHaveAttribute("data-mode", "content");
  await expect(editor).toHaveValue("Unsaved draft");
  await page
    .getByRole("button", {
      name: "Open Collaboration in side view",
      exact: true,
    })
    .click();
  await expect(panel).toHaveAttribute("data-mode", "pinned");
  await page.getByRole("tab", { name: "Files" }).click();
  await page.getByLabel("attachments", { exact: true }).fill("filter");
  await page.getByRole("tab", { name: "Comments" }).click();
  await expect(editor).toHaveValue("Unsaved draft");
  await page.getByRole("button", { name: "Atlas", exact: true }).click();
  await expect(panel).toBeHidden();
  await page.setViewportSize({ width: 900, height: 900 });
  await expect(page.locator("#entity-record-collaboration")).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("#entity-record-collaboration")).toHaveAttribute(
    "data-mode",
    "pinned",
  );

  await page
    .getByRole("button", { name: "Open comments", exact: true })
    .click();
  await expect(editor).toHaveValue("Unsaved draft");
  await expect(panel).toHaveAttribute("data-mode", "pinned");
  await page
    .getByRole("button", { name: "Close collaboration", exact: true })
    .click();
  await expect(page.locator("#entity-record-collaboration")).toBeHidden();
  await page
    .getByRole("button", { name: "Open comments", exact: true })
    .click();
  await expect(editor).toHaveValue("Unsaved draft");
  await expect(page.locator("#entity-record-collaboration")).toHaveCount(1);
  await page.getByRole("tab", { name: "Files" }).click();
  await expect(page.getByLabel("attachments", { exact: true })).toHaveValue(
    "filter",
  );
});
test("keyboard resizing respects bounds and compact screens use full content view", async ({
  page,
}) => {
  const separator = page.getByRole("separator", {
    name: "Resize collaboration",
  });
  await separator.focus();
  await page.keyboard.press("End");
  await expect(separator).toHaveAttribute("aria-valuenow", "560");
  await page.keyboard.press("ArrowLeft");
  await expect(separator).toHaveAttribute("aria-valuenow", "560");
  await page.keyboard.press("Home");
  await expect(separator).toHaveAttribute("aria-valuenow", "360");
  await page.setViewportSize({ width: 390, height: 844 });
  const panel = page.getByRole("region", {
    name: "Collaboration",
    exact: true,
  });
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-mode", "content");
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await page.getByRole("button", { name: "Record Files", exact: true }).click();
  await expect(page.getByLabel("attachments", { exact: true })).toBeVisible();
  expect((await panel.boundingBox())!.width).toBeLessThanOrEqual(390);
});

test("full view uses external navigation and preserves unsaved record fields", async ({
  page,
}) => {
  const field = page.getByLabel("Record name", { exact: true });
  await field.fill("Unsaved record name");
  await page
    .getByRole("button", { name: "Open collaboration in full view" })
    .click();
  await expect(field).toBeHidden();
  await expect(
    page
      .locator(".a-collaboration-panel__header")
      .getByRole("button", {
        name: "Open Collaboration in side view",
        exact: true,
      }),
  ).toBeVisible();
  await expect(
    page
      .locator(".a-collaboration-panel__header")
      .getByRole("button", { name: "Close collaboration", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(
    page.getByText("Comments and files save separately from record changes."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Record Files", exact: true }).click();
  await page.getByLabel("attachments", { exact: true }).fill("saved filter");
  await page
    .getByRole("button", {
      name: "Open Collaboration in side view",
      exact: true,
    })
    .click();
  await expect(field).toHaveValue("Unsaved record name");
  await expect(
    page.getByRole("tab", { name: "Files", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("Collaboration side header matches Atlas height and typography", async ({
  page,
}) => {
  await expect(page.locator(".a-collaboration-panel__header")).toBeVisible();
  await page.evaluate(() =>
    (
      window as unknown as { mountAtlasReference(): void }
    ).mountAtlasReference(),
  );
  await expect(page.locator(".athyper-atlas-workspace__header")).toBeVisible();
  const styles = await page.evaluate(() => {
    const read = (selector: string) => {
      const header = document.querySelector(selector)!;
      const title = getComputedStyle(header.querySelector("strong")!);

      return {
        height: header.getBoundingClientRect().height,
        font: title.fontSize,
        weight: title.fontWeight,
      };
    };
    return {
      collaboration: read(".a-collaboration-panel__header"),
      atlas: read("section.athyper-atlas-workspace > header"),
    };
  });
  expect(styles.collaboration).toEqual(styles.atlas);
});

test("pin toggles layout without losing the record draft", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({ content: css });
  await page.evaluate(bundle);
  const panel = page.locator("#entity-record-collaboration");
  await panel
    .getByRole("textbox", { name: "comments", exact: true })
    .fill("Keep while unpinned");
  await panel.locator("[data-panel-action=pin]").click();
  await expect(panel).toHaveAttribute("data-mode", "drawer");
  await expect(panel.locator("[data-panel-action=pin]")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.locator(".a-collaboration-backdrop")).toBeVisible();
  await panel.locator("[data-panel-action=pin]").click();
  await expect(panel).toHaveAttribute("data-mode", "pinned");
  await expect(
    panel.getByRole("textbox", { name: "comments", exact: true }),
  ).toHaveValue("Keep while unpinned");
  await expect(page.locator(".a-collaboration-backdrop")).toHaveCount(0);
});

test("unpinned collaboration is a modal dialog on the shared tool panel; pinned and full view are not", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({ content: css });
  await page.evaluate(bundle);
  const panel = page.locator("#entity-record-collaboration");
  // One shared frame: the same docked tool panel as list controls.
  await expect(panel).toHaveClass(/\ba-tool-panel\b/);
  await expect(panel).toHaveAttribute("role", "region");
  await expect(panel).not.toHaveAttribute("aria-modal", "true");
  await panel.locator("[data-panel-action=pin]").click();
  await expect(panel).toHaveAttribute("data-mode", "drawer");
  await expect(panel).toHaveAttribute("role", "dialog");
  await expect(panel).toHaveAttribute("aria-modal", "true");
  // Focus stays inside the overlay while it covers the record.
  for (let step = 0; step < 8; step++) {
    await page.keyboard.press("Tab");
    expect(
      await panel.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true);
  }
  // A focused control's tooltip takes the first Escape (WCAG 1.4.13); from a field, Escape closes.
  await panel.getByRole("textbox", { name: "comments", exact: true }).focus();
  // A hovered or just-left control keeps its tooltip briefly; move the pointer off the header.
  await page.mouse.move(700, 450);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Open comments", exact: true }),
  ).not.toBeFocused();
  await page
    .getByRole("button", { name: "Open comments", exact: true })
    .click();
  await expect(panel).toBeVisible();
  await panel.locator("[data-panel-action=fullView]").click();
  await expect(panel).toHaveAttribute("data-mode", "content");
  await expect(panel).toHaveAttribute("role", "region");
  await expect(page.locator(".a-collaboration-backdrop")).toHaveCount(0);
  // Full view is part of the page: Escape does not close it.
  await panel.focus();
  await page.keyboard.press("Escape");
  await expect(panel).toBeVisible();
});
