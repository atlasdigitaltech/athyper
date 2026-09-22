import { buildSync } from "esbuild";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
const fixture = resolve(
  "tooling/scripts/verification/file-discovery-browser-fixture.tsx",
);
const bundle = buildSync({
  entryPoints: [fixture],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  loader: { ".css": "empty" },
  nodePaths: ["apps/neon/node_modules"],
  alias: { "@athyper/platform-shell-app-foundation": fixture },
}).outputFiles[0]!.text;
const css = [
  "packages/platform/foundation/theme/src/styles.css",
  "packages/platform/foundation/ui/src/styles.css",
  "packages/platform/entity/runtime/form-detail/src/styles.css",
]
  .map((path) => readFileSync(path, "utf8").replace(/@import[^;]+;/g, ""))
  .join("\n");
test.beforeEach(async ({ page }) => {
  await page.route("https://files.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html><head><style>${css}</style></head><body><div id="root"></div></body></html>`,
    }),
  );
  await page.route("https://storage.test/**", (route) =>
    route.fulfill({ contentType: "application/pdf", body: "%PDF-1.4\n%%EOF" }),
  );
  await page.goto("https://files.test/");
  await page.evaluate(bundle);
});
test("record content search replaces browsing, highlights safe snippets and paginates", async ({
  page,
}) => {
  await page.getByRole("radio", { name: "File contents", exact: true }).check();
  const input = page.getByRole("searchbox", {
    name: "Search file contents",
    exact: true,
  });
  await input.fill("instarem");
  await input.press("Enter");
  const results = page.getByRole("region", { name: "Content search results" });
  await expect(results).toContainText("1 matching file loaded");
  await expect(results.locator("mark")).toHaveText("instarem");
  await expect(results).toContainText("<script>unsafe</script>");
  await expect(page.locator(".a-file-name strong")).toBeHidden();
  await page.getByRole("button", { name: "More results" }).click();
  await expect(results).toContainText("2 matching files for");
  await expect(page.getByRole("button", { name: "More results" })).toHaveCount(
    0,
  );
  const calls = await page.evaluate(() =>
    (window as any).fileCalls.filter((call: any) =>
      call.path.endsWith("/search"),
    ),
  );
  expect(calls[0].body).toEqual({
    entityType: "fixture",
    entityId: "record",
    q: "instarem",
  });
  expect(calls[1].body.after).toBe("next");
});
test("drawer preview restores query and filters; full view retains results and one viewer", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Folder", exact: true })
    .selectOption("folder");
  await page.getByRole("radio", { name: "File contents", exact: true }).check();
  await page.getByRole("searchbox").fill("instarem");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: "Preview file", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Content search results" }),
  ).toBeHidden();
  await expect(
    page.getByTitle("Document preview", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to results" }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("instarem");
  await expect(
    page.getByRole("button", { name: "Preview file", exact: true }),
  ).toBeFocused();
  await page.evaluate(() => (window as any).setFileMode("content"));
  await page.getByRole("button", { name: "Preview file", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Content search results" }),
  ).toBeVisible();
  await expect(
    page.getByTitle("Document preview", { exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Close preview", exact: true })
    .click();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Folder", exact: true }),
  ).toHaveValue("folder");
});
test("stale queries, empty results, failure and mobile layout are handled", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("radio", { name: "File contents", exact: true }).check();
  const input = page.getByRole("searchbox");
  await input.fill("slow");
  await input.press("Enter");
  await input.fill("empty");
  await input.press("Enter");
  await expect(
    page.getByRole("heading", { name: "No matching file contents", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(550);
  await expect(page.getByText("Receipt.pdf", { exact: true })).toHaveCount(0);
  await input.fill("error");
  await input.press("Enter");
  await expect(page.getByRole("alert")).toContainText("could not be searched");
  await input.fill("instarem");
  await input.press("Enter");
  await expect(page.getByText("Receipt.pdf", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Preview file", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Back to results" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});


test("visible drop zone validates files and uploads dropped bytes through finalize",async({page})=>{
  let puts=0;
  await page.route("https://storage.test/upload",route=>{puts++;return route.fulfill({status:200,headers:{"access-control-allow-origin":"*"}});});
  const zone=page.getByRole("region",{name:"File upload drop zone"});
  await expect(zone.getByText("Drag and drop files here",{exact:true})).toBeVisible();
  const invalid=await page.evaluateHandle(()=>{const data=new DataTransfer();data.items.add(new File(["text"],"bad.txt",{type:"text/plain"}));return data;});
  await zone.dispatchEvent("drop",{dataTransfer:invalid});
  await expect(zone.getByRole("alert")).toContainText("cannot be uploaded");
  expect(puts).toBe(0);
  const valid=await page.evaluateHandle(()=>{const data=new DataTransfer();data.items.add(new File(["%PDF-1.4 fixture"],"dropped.pdf",{type:"application/pdf"}));return data;});
  await zone.dispatchEvent("dragenter",{dataTransfer:valid});
  await expect(zone).toHaveAttribute("data-dragging","true");
  await zone.dispatchEvent("dragenter",{dataTransfer:valid});
  await zone.dispatchEvent("dragleave",{dataTransfer:valid});
  await expect(zone).toHaveAttribute("data-dragging","true");
  await zone.dispatchEvent("drop",{dataTransfer:valid});
  await expect(zone).not.toHaveAttribute("data-dragging","true");
  await expect(zone.getByRole("list",{name:"Upload queue"})).toContainText("dropped.pdf — Uploaded · Processing");
  expect(puts).toBe(1);
  const calls=await page.evaluate(()=>(window as any).fileCalls);
  expect(calls.filter((call:any)=>call.path.endsWith("/stage"))).toHaveLength(1);
  expect(calls.some((call:any)=>call.path.endsWith("/finalize"))).toBe(true);
  await page.setViewportSize({width:390,height:844});
  await expect(zone.getByText("Drag and drop files here",{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("file actions adapt labels to width and expose focus tooltips and grouped actions",async({page})=>{
  const row=page.getByRole("group",{name:"proof.pdf",exact:true});
  const preview=row.getByRole("button",{name:"Preview file",exact:true});
  await expect(preview.locator(".a-file-action__label")).toBeHidden();
  await preview.focus();
  await expect(page.getByRole("tooltip",{name:"Preview file",exact:true})).toHaveCSS("opacity","1");
  const bounds=await preview.boundingBox();expect(bounds!.width).toBeGreaterThanOrEqual(40);expect(bounds!.height).toBeGreaterThanOrEqual(40);
  const summary=row.locator("summary");await summary.focus();await page.keyboard.press("Enter");
  await expect(page.getByRole("button",{name:"Move to folder",exact:true})).toBeVisible();
  await expect(page.getByRole("group",{name:"File actions",exact:true}).locator("hr")).toHaveCount(2);
  await page.keyboard.press("Escape");await expect(summary).toBeFocused();
  await page.evaluate(()=>(window as any).setFileMode("content"));
  await expect(preview.locator(".a-file-action__label")).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  await expect(preview.locator(".a-file-action__label")).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test("closing a file deep link survives refresh and full/side switches",async({page})=>{
  await page.evaluate(()=>{history.replaceState(null,"","?file=first");(window as any).refreshFiles();});
  await expect(page.getByTitle("Document preview",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Back to results"}).click();
  await expect(page).not.toHaveURL(/file=/);
  await page.evaluate(()=>(window as any).refreshFiles());
  await expect(page.getByTitle("Document preview",{exact:true})).toHaveCount(0);
  await page.evaluate(()=>(window as any).setFileMode("content"));
  await expect(page.getByTitle("Document preview",{exact:true})).toHaveCount(0);
});
test("duplicate cancellation performs no upload and version actions distinguish current from retained",async({page})=>{
  await page.getByLabel("Upload files",{exact:true}).setInputFiles({name:"proof.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.4")});
  const choices=page.getByRole("region",{name:"Duplicate file choices"});
  await expect(choices).toBeVisible();await choices.getByRole("button",{name:"Cancel upload"}).click();await expect(choices).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).fileCalls.some((call:any)=>call.path.endsWith("/stage")))).toBe(false);
  await page.locator(".a-attachment-card summary").click();await page.getByRole("button",{name:"Version history",exact:true}).click();
  const versions=page.getByRole("list",{name:"Version history"});await expect(versions).toContainText("Current");await expect(versions).toContainText("Previous version");
  await expect(versions.getByRole("button",{name:"Download version 0"})).toBeVisible();await expect(versions.getByRole("button",{name:"Preview version 0"})).toHaveCount(0);
  await expect(page.getByRole("img",{name:"PDF (PDF)",exact:true})).toBeVisible();
});
test("initial content search and empty files use centered guidance",async({page})=>{
  await page.getByRole("radio",{name:"File contents",exact:true}).check();await expect(page.locator(".a-files-empty-state")).toContainText("Enter a word or phrase");
  await page.getByRole("radio",{name:"File names",exact:true}).check();await page.evaluate(()=>(window as any).emptyFiles());await expect(page.locator(".a-files-empty-state")).toContainText("No files yet");
});


test("file type icons distinguish common extensions without enabling unsupported previews",async({page})=>{
  for(const [name,label] of [["photo.png","Image (PNG)"],["sheet.xlsx","Spreadsheet (XLSX)"],["deck.pptx","Presentation (PPTX)"],["backup.zip","Archive (ZIP)"],["song.mp3","Audio (MP3)"],["movie.mp4","Video (MP4)"],["config.json","Code (JSON)"],["letter.docx","Document (DOCX)"]]){
    await page.evaluate(name=>(window as any).setFileName(name),name);await expect(page.getByRole("img",{name:label,exact:true})).toBeVisible();
  }
});


test("folders are visible without filters and forms stay centered across modes",async({page})=>{
  const folders=page.getByRole("navigation",{name:"Record folders"});await expect(folders.getByRole("button",{name:"Evidence",exact:true})).toBeVisible();
  for(const mode of ["pinned","content"]){
    await page.evaluate(mode=>(window as any).setFileMode(mode),mode);await page.getByRole("button",{name:"New folder",exact:true}).click();
    const dialog=page.getByRole("dialog",{name:"New folder",exact:true});await expect(dialog).toBeVisible();expect(await dialog.evaluate(el=>!el.closest(".a-collaboration-panel"))).toBe(true);
    const box=await dialog.boundingBox();const width=page.viewportSize()!.width;expect(Math.abs(box!.x+box!.width/2-width/2)).toBeLessThan(3);
    await dialog.getByLabel("Folder name",{exact:true}).fill(`Folder ${mode}`);await dialog.getByRole("button",{name:"Create folder"}).click();await expect(dialog).toHaveCount(0);await expect(folders.getByRole("button",{name:`Folder ${mode}`,exact:true})).toBeVisible();
  }
  const row=page.getByRole("group",{name:"proof.pdf",exact:true});await row.locator("summary").click();await page.getByRole("button",{name:"Move to folder",exact:true}).click();const dialog=page.getByRole("dialog",{name:"Move to folder",exact:true});await expect(dialog).toContainText("proof.pdf");await dialog.getByRole("combobox",{name:"Folder",exact:true}).selectOption({label:"Folder content"});await dialog.getByRole("button",{name:"Save",exact:true}).click();await expect(row.locator(".a-file-location")).toContainText("Folder content");
  await folders.getByRole("button",{name:"Folder content",exact:true}).click();await expect(row).toBeVisible();await folders.getByRole("button",{name:"Evidence",exact:true}).click();await expect(row).toBeHidden();
  await expect(page.getByRole("button",{name:/Remove folder filter/})).toHaveCount(0);
  await expect(folders.getByRole("button",{name:"Evidence",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.keyboard.press("Home");
  await expect(folders.getByRole("button",{name:"All files",exact:true})).toBeFocused();
  await expect(folders.getByRole("button",{name:"All files",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(row).toBeVisible();
});


test("rename and category forms save visibly and use mobile viewport dialogs",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  let row=page.getByRole("group",{name:"proof.pdf",exact:true});await row.locator("summary").click();await page.getByRole("button",{name:"Rename",exact:true}).click();
  let dialog=page.getByRole("dialog",{name:"Rename file",exact:true});await dialog.getByLabel("Display name",{exact:true}).fill("Updated proof.pdf");await dialog.getByRole("button",{name:"Save",exact:true}).click();
  await expect(page.locator(".a-global-toast")).toContainText("File renamed to “Updated proof.pdf”");
  await expect(page.locator(".a-file-notice")).toHaveCount(0);
  await page.getByRole("button",{name:"Dismiss notification",exact:true}).click();
  row=page.getByRole("group",{name:"Updated proof.pdf",exact:true});await expect(row).toBeVisible();await row.locator("summary").click();await page.getByRole("button",{name:"Set category",exact:true}).click();
  dialog=page.getByRole("dialog",{name:"Set category",exact:true});await expect(dialog).toContainText("Updated proof.pdf");const box=await dialog.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(390);await dialog.getByRole("combobox",{name:"Category",exact:true}).selectOption("evidence");await dialog.getByRole("button",{name:"Save",exact:true}).click();await expect(row).toContainText("evidence");
});

test("content filters remain available and invalidate previous result pages",async({page})=>{
  await page.getByRole("radio",{name:"File contents",exact:true}).check();
  const input=page.getByRole("searchbox",{name:"Search file contents",exact:true});
  await input.fill("instarem");
  await page.getByRole("button",{name:"Search",exact:true}).click();
  await expect(page.getByRole("button",{name:"More results",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Filters",exact:true}).click();
  await page.getByRole("combobox",{name:"Folder",exact:true}).selectOption("__unfiled");
  await page.getByRole("combobox",{name:"Category",exact:true}).selectOption("evidence");
  await expect(input).toHaveValue("instarem");
  await expect(page.getByRole("button",{name:"More results",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Search",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>JSON.stringify((window as any).fileCalls))).toContain('"unfiled":true');
  await expect.poll(()=>page.evaluate(()=>JSON.stringify((window as any).fileCalls))).toContain('"category":"evidence"');
  await expect(page.getByText("Folders for this record",{exact:true})).toHaveCount(0);
});

test("upload-first layout keeps filters and folder navigation ordered at every width",async({page})=>{
  for(const [mode,width] of [["content",1440],["pinned",700],["content",390]] as const){
    await page.setViewportSize({width,height:900});
    await page.evaluate(mode=>(window as any).setFileMode(mode),mode);
    const upload=page.locator(".a-files-upload-area"),search=page.getByRole("searchbox"),folders=page.getByRole("navigation",{name:"Record folders"});
    const uploadBox=(await upload.boundingBox())!,searchBox=(await search.boundingBox())!;
    expect(uploadBox.y+uploadBox.height).toBeLessThanOrEqual(searchBox.y);
    await page.getByRole("button",{name:"Filters",exact:true}).click();
    const filter=page.getByRole("combobox",{name:"Folder",exact:true});
    await expect(filter).toBeVisible();
    expect((await filter.boundingBox())!.y).toBeLessThan((await folders.boundingBox())!.y);
    await filter.selectOption("folder");
    await expect(folders.getByRole("button",{name:"Evidence",exact:true})).toHaveAttribute("aria-pressed","true");
    await page.getByRole("button",{name:"Filters",exact:true}).click();
    await expect(filter).toBeHidden();
    await expect(folders.getByRole("button",{name:"Evidence",exact:true})).toHaveAttribute("aria-pressed","true");
    await folders.getByRole("button",{name:"All files",exact:true}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`/tmp/files-layout-${mode}-${width}.png`});
  }
});

test("folder menus escape the scrolling strip and support keyboard dismissal",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const trigger=page.locator('summary[aria-label="Actions for folder Evidence"]');
  await trigger.focus();await page.keyboard.press("Enter");
  const action=page.getByRole("button",{name:"Delete folder",exact:true});
  await expect(action).toBeVisible();
  expect(await action.evaluate(el=>!el.closest(".a-file-folders"))).toBe(true);
  await page.keyboard.press("Tab");await expect(action).toBeFocused();
  await page.keyboard.press("Escape");await expect(action).toHaveCount(0);await expect(trigger).toBeFocused();
});

test("search has one clear action and closing preview dismisses its restored-focus tooltip",async({page})=>{
  const input=page.getByRole("searchbox",{name:"Search file names",exact:true});
  await expect(page.locator(".a-search-field")).toHaveCSS("height","40px");
  await expect(input).toHaveCSS("font-size","14px");
  await input.fill("proof");
  await expect(page.getByRole("button",{name:"Clear search",exact:true})).toHaveCount(1);
  await expect(input).toHaveAttribute("type","text"); // No browser-native search cancel control.
  await page.getByRole("button",{name:"Clear search",exact:true}).click();
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  for(const mode of ["pinned","content"]){
    await page.evaluate(mode=>(window as any).setFileMode(mode),mode);
    const row=page.getByRole("group",{name:"proof.pdf",exact:true}),preview=row.getByRole("button",{name:"Preview file",exact:true});
    await preview.click();
    await page.getByRole("button",{name:mode==="content"?"Close preview":"Back to results",exact:true}).click();
    await expect(preview).toBeFocused();
    await expect(page.getByRole("tooltip",{name:"Preview file",exact:true})).toBeHidden();
    await page.mouse.move(0,0);await preview.hover();
    await expect(page.getByRole("tooltip",{name:"Preview file",exact:true})).toHaveCSS("opacity","1");
  }
});

test("folder delete menu is themed and aligned to its trigger",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const trigger=page.locator('summary[aria-label="Actions for folder Evidence"]');
  await trigger.click();
  const action=page.getByRole("button",{name:"Delete folder",exact:true});
  await expect(action).toHaveClass(/a-menu__item/);
  const menu=action.locator(".."),box=(await menu.boundingBox())!,anchor=(await trigger.boundingBox())!;
  expect(Math.abs(box.x+box.width-(anchor.x+anchor.width))).toBeLessThan(3);
  expect(box.y).toBeGreaterThanOrEqual(anchor.y+anchor.height);
  expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(32);
  expect(box.width).toBeLessThan(180);
  await page.screenshot({path:"/tmp/files-folder-menu.png"});
});


test("upload completion batches toast and waits for list visibility before clearing ready rows",async({page})=>{
  await page.route("https://storage.test/upload",route=>route.fulfill({status:200,headers:{"access-control-allow-origin":"*"}}));
  await page.clock.install();
  await page.getByLabel("Upload files",{exact:true}).setInputFiles([
    {name:"one.pdf",mimeType:"application/pdf",buffer:Buffer.from("one")},
    {name:"two.pdf",mimeType:"application/pdf",buffer:Buffer.from("two")}
  ]);
  const queue=page.getByRole("list",{name:"Upload queue"});
  await expect(queue).toContainText("Uploaded · Processing");
  await expect(page.locator(".a-global-toast")).toContainText("2 files uploaded");
  await expect(page.locator(".a-global-toast")).toHaveCount(1);
  await page.clock.runFor(6000);
  await expect(queue.locator("li")).toHaveCount(2);
  await page.evaluate(()=>{(window as any).showUploaded=true;(window as any).refreshFiles();});
  await expect(queue).toContainText("ready");
  await page.clock.runFor(1900);await expect(queue.locator("li")).toHaveCount(2);
  await page.clock.runFor(200);await expect(queue).toHaveCount(0);
  await expect(page.getByRole("group",{name:"one.pdf",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Dismiss completed uploads"})).toHaveCount(0);
});
test("failed uploads stay visible and can be removed from the queue",async({page})=>{
  await page.route("https://storage.test/upload",route=>route.fulfill({status:500,headers:{"access-control-allow-origin":"*"}}));
  await page.getByLabel("Upload files",{exact:true}).setInputFiles({name:"failed.pdf",mimeType:"application/pdf",buffer:Buffer.from("fail")});
  const queue=page.getByRole("list",{name:"Upload queue"});
  await expect(queue).toContainText("failed");
  await expect(queue.getByRole("button",{name:"Retry this file"})).toBeVisible();
  await expect(page.locator(".a-global-toast")).toHaveCount(0);
  await queue.getByRole("button",{name:"Remove from queue"}).click();
  await expect(queue).toHaveCount(0);
});

test("last-row actions flip upward without extending the page and use a themed tooltip",async({page})=>{
  for(const [mode,width,height] of [["pinned",700,900],["content",1440,900],["pinned",390,400]] as const){
    await page.setViewportSize({width,height});
    await page.evaluate(mode=>(window as any).setFileMode(mode),mode);
    const row=page.getByRole("group",{name:"proof.pdf",exact:true}),trigger=row.locator("summary");
    await row.evaluate(el=>{(el as HTMLElement).style.marginTop="600px";el.scrollIntoView({block:"end"});});
    await trigger.hover();
    await expect(trigger).not.toHaveAttribute("title");
    await expect(row.getByRole("tooltip",{name:"File actions",exact:true})).toHaveCSS("opacity","1");
    const before=await page.evaluate(()=>document.documentElement.scrollHeight);
    await trigger.click();
    const menu=page.getByRole("group",{name:"File actions",exact:true});
    const box=(await menu.boundingBox())!,anchor=(await trigger.boundingBox())!;
    expect(box.y).toBeLessThan(anchor.y);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y+box.height).toBeLessThanOrEqual(height);
    expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBe(before);
    await expect(menu.getByRole("button",{name:"Rename",exact:true})).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);await expect(trigger).toBeFocused();
  }
});


test("fresh Files sessions browse names and empty-name recovery offers both modes",async({page})=>{
  await page.evaluate(()=>localStorage.setItem("athyper.files.search-scope","contents"));
  await page.reload();await page.evaluate(bundle);
  await expect(page.getByRole("radio",{name:"File names",exact:true})).toBeChecked();
  await page.getByRole("searchbox",{name:"Search file names",exact:true}).fill("not-a-file");
  await expect(page.getByRole("heading",{name:"No matching files",exact:true})).toBeVisible();
  await expect(page.locator(".a-attachment-workspace__count")).toBeHidden();
  await page.getByRole("button",{name:"Search file contents",exact:true}).click();
  await expect(page.getByRole("radio",{name:"File contents",exact:true})).toBeChecked();
  await expect(page.getByRole("searchbox",{name:"Search file contents",exact:true})).toHaveValue("not-a-file");
  await page.getByRole("button",{name:"Show files",exact:true}).click();
  await page.getByRole("button",{name:"Show all files",exact:true}).click();
  await expect(page.getByRole("searchbox",{name:"Search file names",exact:true})).toBeEmpty();
  await expect(page.getByRole("heading",{name:"No matching files",exact:true})).toHaveCount(0);
});

test("full-view rows expose version history and filenames open preview",async({page})=>{
  await page.evaluate(()=>(window as any).setFileMode('content'));
  const row=page.getByRole('group',{name:'proof.pdf',exact:true});
  const history=row.getByRole('button',{name:'Version history',exact:true});
  await expect(history).toBeVisible();
  await history.click();await expect(row.getByRole('button',{name:'Hide history',exact:true})).toHaveAttribute('aria-expanded','true');
  await expect(row.getByText('Previous versions are retained.',{exact:false})).toBeVisible();
  await row.getByRole('button',{name:'proof.pdf',exact:true}).click();
  await expect(page.getByRole('complementary',{name:'Selected file preview'})).toBeVisible();
});


test("history toggles in full view and closes directly in the side panel",async({page})=>{
  const row=page.getByRole('group',{name:'proof.pdf',exact:true});
  await row.locator('summary').click();
  await page.getByRole('button',{name:'Version history',exact:true}).click();
  await row.getByRole('button',{name:'Hide history',exact:true}).click();
  await expect(row.locator('.a-version-note')).toHaveCount(0);
  await expect(row.locator('summary')).toBeFocused();
  await page.evaluate(()=>(window as any).setFileMode('content'));
  await row.getByRole('button',{name:'Version history',exact:true}).click();
  const hide=row.getByRole('button',{name:'Hide history',exact:true});
  await expect(hide).toHaveAttribute('aria-expanded','true');
  await hide.click();
  await expect(row.locator('.a-version-note')).toHaveCount(0);
  await expect(row.getByRole('button',{name:'Version history',exact:true})).toHaveAttribute('aria-expanded','false');
});

test("image thumbnails load only near the viewport, preserve tile size and fall back on failure",async({page})=>{
  await page.route('https://storage.test/thumb.png',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')}));
  await page.locator('.a-attachment-workspace__list').evaluate(el=>(el as HTMLElement).style.marginTop='2500px');
  await page.evaluate(()=>(window as any).setFileName('screenshot.png'));
  await page.waitForTimeout(200);
  expect(await page.evaluate(()=>(window as any).fileCalls.filter((c:any)=>c.body?.rendition==='thumbnail_sm').length)).toBe(0);
  const tile=page.locator('.a-attachment-thumbnail');
  await tile.scrollIntoViewIfNeeded();
  const image=tile.locator('img');
  await expect(image).toBeVisible();
  await expect(tile).toHaveCSS('width','48px');
  await expect(image).toHaveCSS('object-fit','contain');
  await expect(tile.locator('.a-attachment-thumbnail__badge')).toHaveText('PNG');
  await image.dispatchEvent('error');
  await expect(image).toHaveCount(0);
  await expect(tile.getByRole('img',{name:'Image (PNG)',exact:true})).toBeVisible();
  await page.evaluate(()=>(window as any).setFileMode('content'));
  await expect(tile).toHaveCSS('width','56px');
  await tile.getByRole('button',{name:'Preview screenshot.png',exact:true}).click();
  await expect(page.getByRole('complementary',{name:'Selected file preview'})).toBeVisible();
});

test("filename tooltip appears only for truncation and follows resize in both views",async({page})=>{
  const longName='workspace_configuration_'+ 'long-name-'.repeat(25)+'.pdf';
  for(const mode of ['pinned','content']) {
    await page.evaluate(mode=>(window as any).setFileMode(mode),mode);
    await page.evaluate(()=>(window as any).setFileName('proof.pdf'));
    const name=page.locator('.a-file-name__preview');
    await name.hover();
    await expect(page.getByRole('tooltip',{name:'proof.pdf',exact:true})).toHaveCount(0);
    await name.focus();
    await expect(page.getByRole('tooltip',{name:'proof.pdf',exact:true})).toHaveCount(0);
    await page.evaluate(name=>(window as any).setFileName(name),longName);
    await name.focus();
    const tip=page.getByRole('tooltip',{name:longName,exact:true});
    await expect(tip).toBeVisible();
    const bounds=await tip.boundingBox();
    expect(bounds!.width).toBeGreaterThan(100);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await name.evaluate(el=>(el as HTMLElement).style.webkitLineClamp='unset');
    await expect(tip).toHaveCount(0);
    await name.evaluate(el=>(el as HTMLElement).style.removeProperty('-webkit-line-clamp'));
    await expect(tip).toBeVisible();
    await page.keyboard.press('Escape');await expect(tip).toHaveCount(0);
    await name.blur();await page.mouse.move(0,0);
  }
});

test("files can be moved to Unfiled without removing their record link",async({page})=>{
  const row=page.getByRole('group',{name:'proof.pdf',exact:true});
  await row.locator('summary').click();
  await page.getByRole('button',{name:'Move to folder',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Move to folder',exact:true});
  await dialog.getByRole('combobox',{name:'Folder',exact:true}).selectOption('');
  await dialog.getByRole('button',{name:'Save',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(row.locator('.a-file-location')).toContainText('Unfiled');
  expect(await page.evaluate(()=>(window as any).fileCalls.find((c:any)=>c.body?.command==='move').body.folderId)).toBeNull();
  await page.getByRole('navigation',{name:'Record folders'}).getByRole('button',{name:'Unfiled',exact:true}).click();
  await expect(row).toBeVisible();
});
