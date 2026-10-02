import { buildSync } from "esbuild";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
test("rapid drops share one admission lock while duplicate checking awaits",async({page})=>{
  await page.route("https://storage.test/upload",route=>route.fulfill({status:200,headers:{"access-control-allow-origin":"*"}}));
  await page.evaluate(()=>(window as any).slowBrowse=true);
  await page.getByRole("region",{name:"File upload drop zone"}).evaluate(element=>{
    for(const name of ["one.pdf","two.pdf"]) {
      const data=new DataTransfer();
      data.items.add(new File(["pdf"],name,{type:"application/pdf"}));
      element.dispatchEvent(new DragEvent("drop",{dataTransfer:data,bubbles:true,cancelable:true}));
    }
  });
  await expect.poll(()=>page.evaluate(()=>(window as any).fileCalls.filter((call:any)=>call.path.endsWith("/finalize")).length)).toBe(1);
  expect(await page.evaluate(()=>(window as any).fileCalls.filter((call:any)=>call.path.endsWith("/stage")).map((call:any)=>call.body.fileName))).toEqual(["one.pdf"]);
});
test("filtered files retain version history",async({page})=>{
  await page.evaluate(()=>(window as any).setFileMode("content"));
  await page.getByRole("searchbox").fill("proof");
  await expect.poll(()=>page.evaluate(()=>(window as any).fileCalls.filter((call:any)=>call.path.endsWith("/browse")).length)).toBeGreaterThan(0);
  await page.getByRole("button",{name:"Version history",exact:true}).click();
  await expect(page.getByRole("list",{name:"Version history"})).toContainText("v0");
});
test("status refresh preserves open version history without duplicate requests", async ({page}) => {
  await page.evaluate(() => (window as any).setFileMode("content"));
  await page.getByRole("button", {name:"Version history",exact:true}).click();
  const history = page.getByRole("list", {name:"Version history"});
  await expect(history).toContainText("v0");
  const count = () => page.evaluate(() => (window as any).fileCalls.filter((c:any) => c.body?.includeHistory).length);
  const before = await count();
  for (let i=0;i<3;i++) {
    await page.evaluate(() => (window as any).refreshFiles());
    await expect(history).toContainText("v0");
  }
  await page.waitForTimeout(250);
  expect(await count()).toBe(before);
  await page.evaluate(() => { (window as any).slowHistory=true; (window as any).fileRevision=2; (window as any).refreshFiles(); });
  await expect.poll(count).toBe(before+1);
  await expect(history).toContainText("v0");
  await page.evaluate(() => { (window as any).historyTenant="tenant-b"; (window as any).refreshFiles(); });
  await page.waitForTimeout(400); // Deliberately uncancellable mock must not repopulate another scope.
  await expect(history).toHaveCount(0);
});
test("file deep links resolve beyond the loaded page",async({page})=>{
  await page.evaluate(()=>{
    (window as any).hiddenFiles=[{id:"hidden",fileName:"off-page.pdf",processingStatus:"active",version:1}];
    history.pushState({},"","?file=hidden");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByRole("complementary",{name:"Selected file preview"})).toContainText("off-page.pdf");
  expect(await page.evaluate(()=>(window as any).fileCalls.find((call:any)=>call.body?.attachmentId==="hidden")?.body.entityId)).toBe("record");
});
test("revoking search access discards an in-flight result before access returns", async ({
  page,
}) => {
  await page.getByRole("radio", { name: "File contents", exact: true }).check();
  await page.getByRole("searchbox").fill("slow");
  await page.getByRole("searchbox").press("Enter");
  await expect(page.getByText("Searching file contents…")).toBeVisible();
  await page.evaluate(() => (window as any).setCanSearch(false));
  await expect(
    page.getByRole("radio", { name: "File contents", exact: true }),
  ).toHaveCount(0);
  await page.waitForTimeout(600); // The mock deliberately ignores cancellation.
  await page.evaluate(() => (window as any).setCanSearch(true));
  await page.getByRole("radio", { name: "File contents", exact: true }).check();
  await expect(
    page.getByText("Search inside files", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".a-file-search-result")).toHaveCount(0);
});
test("short snippets clipped by a narrow panel can be expanded", async ({
  page,
}) => {
  await page.setViewportSize({ width: 380, height: 700 });
  await page.getByRole("radio", { name: "File contents", exact: true }).check();
  await page.getByRole("searchbox").fill("narrow");
  await page.getByRole("searchbox").press("Enter");
  await page.getByRole("button", { name: "Show more", exact: true }).click();
  const excerpt = page.locator(".a-file-search-excerpt");
  await expect(excerpt).toHaveAttribute("data-expanded", "true");
  expect(
    await excerpt.evaluate(
      (element) => element.scrollHeight <= element.clientHeight + 1,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Show less", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Show more", exact: true }),
  ).toBeVisible();
});
for (const theme of ["light", "dark", "high-contrast"]) {
  test(`file action focus uses the shared ${theme} theme tokens`, async ({
    page,
  }) => {
    await page.evaluate(
      (value) => (document.documentElement.dataset.theme = value),
      theme,
    );
    const action = page
      .getByRole("button", { name: "Download", exact: true })
      .first();
    await page.keyboard.press("Tab");
    await action.focus();
    expect(
      await action.evaluate(
        (element) => getComputedStyle(element).outlineStyle,
      ),
    ).toBe("solid");
    expect(
      await action.evaluate(
        (element) => getComputedStyle(element).outlineWidth,
      ),
    ).toBe("3px");
  });
}
for (const theme of ["light", "dark"]) {
  test(`Mono ${theme} focus and dropdown selection follow semantic tokens`, async ({page}) => {
    await page.evaluate(theme => {
      document.documentElement.dataset.themeFamily = "atlas-mono";
      document.documentElement.dataset.theme = theme;
    }, theme);
    await page.getByRole("button", {name:"New folder", exact:true}).click();
    const input = page.getByLabel("Folder name", {exact:true});
    await input.focus();
    const colors = await input.evaluate(el => {
      const probe = document.createElement("span");
      probe.style.color = "var(--a-selection-subtle-foreground)";
      el.parentElement!.append(probe);
      const expected = getComputedStyle(probe).color;
      probe.remove();
      return {actual:getComputedStyle(el).outlineColor, expected};
    });
    expect(colors.actual).toBe(colors.expected);
    await page.getByRole("button", {name:"Cancel",exact:true}).click();
    // Filters use design-system chips (no OS dropdown); the chosen chip follows the selection tokens.
    await page.getByRole("button", {name:"Filters",exact:true}).click();
    const chip = page.getByRole("group", {name:"Category", exact:true}).getByRole("button", {name:"Evidence", exact:true});
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await page.mouse.move(0, 0);
    const selection = await chip.evaluate(el => {
      const probe = document.createElement("span");
      probe.style.background = "var(--a-selection-subtle)";
      document.body.append(probe);
      const expected = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {actual:getComputedStyle(el).backgroundColor, expected};
    });
    expect(selection.actual).toBe(selection.expected);
  });
}
test("downloads preserve the record and use an isolated browser target", async ({
  page,
}) => {
  await page.evaluate(() =>
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (
          target instanceof HTMLAnchorElement &&
          target.href === "https://storage.test/download"
        ) {
          event.preventDefault();
          (window as any).downloadLink = {
            target: target.target,
            rel: target.rel,
          };
        }
      },
      true,
    ),
  );
  const before = page.url();
  await page
    .getByRole("button", { name: "Download", exact: true })
    .first()
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).downloadLink?.target))
    .toBe("_blank");
  expect(page.url()).toBe(before);
  expect(await page.evaluate(() => (window as any).downloadLink.rel)).toContain(
    "noopener",
  );
});
test("processing backoff survives section refresh and stops at active", async ({
  page,
}) => {
  await page.clock.install();
  const count = () =>
    page.evaluate(
      () =>
        (window as any).fileCalls.filter((c: any) => c.path.endsWith("/status"))
          .length,
    );
  await page.evaluate(() => {
    (window as any).pendingFile = true;
    (window as any).refreshFiles();
  });
  await expect.poll(count).toBe(1);
  await page.clock.runFor(2000);
  await expect.poll(count).toBe(2);
  await page.evaluate(() => (window as any).refreshFiles());
  await page.clock.runFor(1000);
  expect(await count()).toBe(2);
  await page.clock.runFor(3000);
  await expect.poll(count).toBe(3);
  await page.evaluate(() => {
    (window as any).pendingFile = false;
  });
  await page.clock.runFor(8000);
  await expect.poll(count).toBe(4);
  await page.clock.runFor(20000);
  expect(await count()).toBe(4);
});
test("version upload validates before staging", async ({ page }) => {
  await page.locator('summary[aria-label="File actions"]').first().click();
  const chooserPromise = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Upload new version", exact: true })
    .click();
  await (
    await chooserPromise
  ).setFiles({
    name: "empty.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(0),
  });
  await expect(page.getByRole("alert")).toContainText("empty");
  expect(
    await page.evaluate(
      () =>
        (window as any).fileCalls.filter((c: any) => c.path.endsWith("/stage"))
          .length,
    ),
  ).toBe(0);
});
test("copy link confirms successful clipboard delivery", async ({ page }) => {
  await page.evaluate(() => {
    navigator.clipboard.writeText = async (value) => {
      (window as any).copiedLink = value;
    };
  });
  await page.locator('summary[aria-label="File actions"]').first().click();
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(page.getByText("Link copied", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).copiedLink)).toContain(
    "collaborationSection=attachments",
  );
});
test("expanded search snippets reveal text beyond the original excerpt", async ({
  page,
}) => {
  await page.getByRole("radio", { name: "File contents", exact: true }).check();
  await page.getByRole("searchbox").fill("long");
  await page.getByRole("searchbox").press("Enter");
  await expect(page.getByText(/FINAL WORDS/)).toHaveCount(0);
  await page.getByRole("button", { name: "Show more", exact: true }).click();
  await expect(page.getByText(/FINAL WORDS/)).toBeVisible();
});
test("folder revision conflict can be retried with a fresh command", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).folderConflict = true;
  });
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  await page.getByRole("textbox", { name: "Folder name" }).fill("Retry folder");
  await page
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Refresh folder list");
  await page
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const calls = await page.evaluate(() =>
    (window as any).fileCalls.filter((c: any) => c.path.endsWith("/folders")),
  );
  expect(calls[1].body.expectedRevision).toBe(2);
  expect(calls[1].idempotencyKey).not.toBe(calls[0].idempotencyKey);
});
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
  await page.getByRole("button",{name:"Add files",exact:true}).click();
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
  await page.getByRole("navigation", { name: "Record folders" })
    .getByRole("button", { name: "Evidence", exact: true })
    .click();
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
    page.getByRole("navigation", { name: "Record folders" }).getByRole("button", { name: "Evidence", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
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
    page.getByRole("heading", {
      name: "No matching file contents",
      exact: true,
    }),
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

test("visible drop zone validates files and uploads dropped bytes through finalize", async ({
  page,
}) => {
  let puts = 0;
  await page.route("https://storage.test/upload", (route) => {
    puts++;
    return route.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*" },
    });
  });
  const zone = page.getByRole("region", { name: "File upload drop zone" });
  await expect(
    zone.getByText("Drag and drop files here", { exact: true }),
  ).toBeVisible();
  const invalid = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(["text"], "bad.txt", { type: "text/plain" }));
    return data;
  });
  await zone.dispatchEvent("drop", { dataTransfer: invalid });
  await expect(zone.getByRole("alert")).toContainText("cannot be uploaded");
  expect(puts).toBe(0);
  const valid = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(
      new File(["%PDF-1.4 fixture"], "dropped.pdf", {
        type: "application/pdf",
      }),
    );
    return data;
  });
  await zone.dispatchEvent("dragenter", { dataTransfer: valid });
  await expect(zone).toHaveAttribute("data-dragging", "true");
  await zone.dispatchEvent("dragenter", { dataTransfer: valid });
  await zone.dispatchEvent("dragleave", { dataTransfer: valid });
  await expect(zone).toHaveAttribute("data-dragging", "true");
  await zone.dispatchEvent("drop", { dataTransfer: valid });
  await expect(zone).not.toHaveAttribute("data-dragging", "true");
  await expect(zone.getByRole("list", { name: "Upload queue" })).toContainText(
    "dropped.pdf — Updating file list…",
  );
  expect(puts).toBe(1);
  const calls = await page.evaluate(() => (window as any).fileCalls);
  expect(
    calls.filter((call: any) => call.path.endsWith("/stage")),
  ).toHaveLength(1);
  expect(calls.some((call: any) => call.path.endsWith("/finalize"))).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    zone.getByText("Drag and drop files here", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("file actions adapt labels to width and expose focus tooltips and grouped actions", async ({
  page,
}) => {
  const row = page.getByRole("group", { name: "proof.pdf", exact: true });
  const preview = row.getByRole("button", {
    name: "Preview file",
    exact: true,
  });
  await expect(preview.locator(".a-file-action__label")).toBeHidden();
  await preview.focus();
  await expect(
    page.getByRole("tooltip", { name: "Preview file", exact: true }),
  ).toHaveCSS("opacity", "1");
  const bounds = await preview.boundingBox();
  expect(bounds!.width).toBeGreaterThanOrEqual(40);
  expect(bounds!.height).toBeGreaterThanOrEqual(40);
  const summary = row.locator("summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Move to folder", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("group", { name: "File actions", exact: true })
      .locator("hr"),
  ).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(summary).toBeFocused();
  await page.evaluate(() => (window as any).setFileMode("content"));
  await expect(preview.locator(".a-file-action__label")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(preview.locator(".a-file-action__label")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("closing a file deep link survives refresh and full/side switches", async ({
  page,
}) => {
  await page.evaluate(() => {
    history.replaceState(null, "", "?file=first");
    (window as any).refreshFiles();
  });
  await expect(
    page.getByTitle("Document preview", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to results" }).click();
  await expect(page).not.toHaveURL(/file=/);
  await page.evaluate(() => (window as any).refreshFiles());
  await expect(
    page.getByTitle("Document preview", { exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => (window as any).setFileMode("content"));
  await expect(
    page.getByTitle("Document preview", { exact: true }),
  ).toHaveCount(0);
});
test("duplicate cancellation performs no upload and version actions distinguish current from retained", async ({
  page,
}) => {
  await page
    .getByLabel("Upload files", { exact: true })
    .setInputFiles({
      name: "proof.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4"),
    });
  const choices = page.getByRole("region", { name: "Duplicate file choices" });
  await expect(choices).toBeVisible();
  await choices.getByRole("button", { name: "Cancel upload" }).click();
  await expect(choices).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      (window as any).fileCalls.some((call: any) =>
        call.path.endsWith("/stage"),
      ),
    ),
  ).toBe(false);
  await page
    .getByRole("button", { name: "Version history", exact: true })
    .click();
  const versions = page.getByRole("list", { name: "Version history" });
  await expect(versions).toContainText("Current");
  await expect(versions).toContainText("Previous version");
  await expect(
    versions.getByRole("button", { name: "Download version 0" }),
  ).toBeVisible();
  await expect(
    versions.getByRole("button", { name: "Preview version 0" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("img", { name: "PDF (PDF)", exact: true }),
  ).toBeVisible();
});
test("initial content search and empty files use centered guidance", async ({
  page,
}) => {
  await page.getByRole("radio", { name: "File contents", exact: true }).check();
  await expect(page.locator(".a-files-empty-state")).toContainText(
    "Enter a word or phrase",
  );
  await page.getByRole("radio", { name: "File names", exact: true }).check();
  await page.evaluate(() => (window as any).emptyFiles());
  await expect(page.locator(".a-files-empty-state")).toContainText(
    "No files yet",
  );
});

test("file type icons distinguish common extensions without enabling unsupported previews", async ({
  page,
}) => {
  for (const [name, label] of [
    ["photo.png", "Image (PNG)"],
    ["sheet.xlsx", "Spreadsheet (XLSX)"],
    ["deck.pptx", "Presentation (PPTX)"],
    ["backup.zip", "Archive (ZIP)"],
    ["song.mp3", "Audio (MP3)"],
    ["movie.mp4", "Video (MP4)"],
    ["config.json", "Code (JSON)"],
    ["letter.docx", "Document (DOCX)"],
  ]) {
    await page.evaluate((name) => (window as any).setFileName(name), name);
    await expect(
      page.getByRole("img", { name: label, exact: true }),
    ).toBeVisible();
  }
});

test("folders are visible without filters and forms stay centered across modes", async ({
  page,
}) => {
  const folders = page.getByRole("navigation", { name: "Record folders" });
  await expect(
    folders.getByRole("button", { name: "Evidence", exact: true }),
  ).toBeVisible();
  for (const mode of ["pinned", "content"]) {
    await page.evaluate((mode) => (window as any).setFileMode(mode), mode);
    await page.getByRole("button", { name: "New folder", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "New folder",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    expect(
      await dialog.evaluate((el) => !el.closest(".a-collaboration-panel")),
    ).toBe(true);
    const box = await dialog.boundingBox();
    const width = page.viewportSize()!.width;
    expect(Math.abs(box!.x + box!.width / 2 - width / 2)).toBeLessThan(3);
    await dialog
      .getByLabel("Folder name", { exact: true })
      .fill(`Folder ${mode}`);
    await dialog.getByRole("button", { name: "Create folder" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      folders.getByRole("button", { name: `Folder ${mode}`, exact: true }),
    ).toBeVisible();
  }
  const row = page.getByRole("group", { name: "proof.pdf", exact: true });
  await row.locator("summary").click();
  await page
    .getByRole("button", { name: "Move to folder", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Move to folder",
    exact: true,
  });
  await expect(dialog).toContainText("proof.pdf");
  await dialog
    .getByRole("group", { name: "Folder", exact: true })
    .getByRole("button", { name: "Folder content", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row.locator(".a-file-location")).toContainText("Folder content");
  await folders
    .getByRole("button", { name: "Folder content", exact: true })
    .click();
  await expect(row).toBeVisible();
  await folders.getByRole("button", { name: "Evidence", exact: true }).click();
  await expect(row).toBeHidden();
  await expect(
    page.getByRole("button", { name: /Remove folder filter/ }),
  ).toHaveCount(0);
  await expect(
    folders.getByRole("button", { name: "Evidence", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Home");
  await expect(
    folders.getByRole("button", { name: "All files", exact: true }),
  ).toBeFocused();
  await expect(
    folders.getByRole("button", { name: "All files", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(row).toBeVisible();
});

test("rename and category forms save visibly and use mobile viewport dialogs", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let row = page.getByRole("group", { name: "proof.pdf", exact: true });
  await row.locator("summary").click();
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Rename file", exact: true });
  await dialog
    .getByLabel("Display name", { exact: true })
    .fill("Updated proof.pdf");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".a-global-toast")).toContainText(
    "File renamed to “Updated proof.pdf”",
  );
  await expect(page.locator(".a-file-notice")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Dismiss notification", exact: true })
    .click();
  row = page.getByRole("group", { name: "Updated proof.pdf", exact: true });
  await expect(row).toBeVisible();
  await row.locator("summary").click();
  await page.getByRole("button", { name: "Set category", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Set category", exact: true });
  await expect(dialog).toContainText("Updated proof.pdf");
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await dialog
    .getByRole("radiogroup", { name: "Category", exact: true })
    .getByRole("radio", { name: "Evidence", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row).toContainText("evidence");
});

test("content filters remain available and invalidate previous result pages", async ({
  page,
}) => {
  await page.getByRole("radio", { name: "File contents", exact: true }).check();
  const input = page.getByRole("searchbox", {
    name: "Search file contents",
    exact: true,
  });
  await input.fill("instarem");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "More results", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("navigation", { name: "Record folders" })
    .getByRole("button", { name: "Unfiled", exact: true })
    .click();
  await page
    .getByRole("group", { name: "Category", exact: true })
    .getByRole("button", { name: "Evidence", exact: true })
    .click();
  await expect(input).toHaveValue("instarem");
  await expect(
    page.getByRole("button", { name: "More results", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => JSON.stringify((window as any).fileCalls)))
    .toContain('"unfiled":true');
  await expect
    .poll(() => page.evaluate(() => JSON.stringify((window as any).fileCalls)))
    .toContain('"category":"evidence"');
  await expect(
    page.getByText("Folders for this record", { exact: true }),
  ).toHaveCount(0);
});

test("upload opens below the action row at every width", async ({
  page,
}) => {
  for (const [mode, width] of [
    ["content", 1440],
    ["pinned", 700],
    ["content", 390],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate((mode) => (window as any).setFileMode(mode), mode);
    const upload = page.locator(".a-files-upload-area"),
      search = page.getByRole("searchbox"),
      folders = page.getByRole("navigation", { name: "Record folders" });
    const uploadBox = (await upload.boundingBox())!,
      searchBox = (await search.boundingBox())!;
    expect(uploadBox.y).toBeGreaterThanOrEqual(searchBox.y + searchBox.height);
    const addBox=(await page.getByRole("button",{name:"＋ Add files",exact:true}).boundingBox())!;
    expect(uploadBox.y).toBeGreaterThanOrEqual(addBox.y + addBox.height);
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    const filter = page.getByRole("group", { name: "Category", exact: true });
    await expect(filter).toBeVisible();
    expect((await filter.boundingBox())!.y).toBeLessThan(
      (await folders.boundingBox())!.y,
    );
    await folders.getByRole("button", { name: "Evidence", exact: true }).click();
    await expect(
      folders.getByRole("button", { name: "Evidence", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await expect(filter).toBeHidden();
    await expect(
      folders.getByRole("button", { name: "Evidence", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await folders
      .getByRole("button", { name: "All files", exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `/tmp/files-layout-${mode}-${width}.png` });
  }
});

test("folder menus escape the scrolling strip and support keyboard dismissal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.locator(
    'summary[aria-label="Actions for folder Evidence"]',
  );
  await trigger.focus();
  await page.keyboard.press("Enter");
  const action = page.getByRole("button", {
    name: "Delete folder",
    exact: true,
  });
  await expect(action).toBeVisible();
  expect(await action.evaluate((el) => !el.closest(".a-file-folders"))).toBe(
    true,
  );
  await page.keyboard.press("Tab");
  await expect(action).toBeFocused();
  // A deliberately focused action may own a tooltip. Escape dismisses that
  // first, without also activating/dismissing its containing menu.
  if (await page.getByRole("tooltip").count()) await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(action).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("search has one clear action and closing preview dismisses its restored-focus tooltip", async ({
  page,
}) => {
  const input = page.getByRole("searchbox", {
    name: "Search file names",
    exact: true,
  });
  await expect(page.locator(".a-search-field")).toHaveCSS("height", "40px");
  await expect(input).toHaveCSS("font-size", "14px");
  await input.fill("proof");
  await expect(
    page.getByRole("button", { name: "Clear search", exact: true }),
  ).toHaveCount(1);
  await expect(input).toHaveAttribute("type", "text"); // No browser-native search cancel control.
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  for (const mode of ["pinned", "content"]) {
    await page.evaluate((mode) => (window as any).setFileMode(mode), mode);
    const row = page.getByRole("group", { name: "proof.pdf", exact: true }),
      preview = row.getByRole("button", { name: "Preview file", exact: true });
    await preview.click();
    await page
      .getByRole("button", {
        name: mode === "content" ? "Close preview" : "Back to results",
        exact: true,
      })
      .click();
    await expect(preview).toBeFocused();
    await expect(
      page.getByRole("tooltip", { name: "Preview file", exact: true }),
    ).toBeHidden();
    await page.mouse.move(0, 0);
    await preview.hover();
    await expect(
      page.getByRole("tooltip", { name: "Preview file", exact: true }),
    ).toHaveCSS("opacity", "1");
  }
});

test("folder delete menu is themed and aligned to its trigger", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.locator(
    'summary[aria-label="Actions for folder Evidence"]',
  );
  await trigger.click();
  const action = page.getByRole("button", {
    name: "Delete folder",
    exact: true,
  });
  await expect(action).toHaveClass(/a-menu__item/);
  const menu = action.locator(".."),
    box = (await menu.boundingBox())!,
    anchor = (await trigger.boundingBox())!;
  expect(Math.abs(box.x + box.width - (anchor.x + anchor.width))).toBeLessThan(
    3,
  );
  expect(box.y).toBeGreaterThanOrEqual(anchor.y + anchor.height);
  expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(32);
  expect(box.width).toBeLessThan(180);
  await page.screenshot({ path: "/tmp/files-folder-menu.png" });
});

test("upload completion batches toast and waits for list visibility before clearing ready rows", async ({
  page,
}) => {
  await page.route("https://storage.test/upload", (route) =>
    route.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.clock.install();
  await page.getByLabel("Upload files", { exact: true }).setInputFiles([
    {
      name: "one.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("one"),
    },
    {
      name: "two.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("two"),
    },
  ]);
  const queue = page.getByRole("list", { name: "Upload queue" });
  await expect(queue).toContainText("Updating file list…");
  await page.getByRole("button",{name:"＋ Add files",exact:true}).click();
  await expect(queue).toBeVisible();
  await expect(page.locator(".a-global-toast")).toContainText(
    "2 files uploaded",
  );
  await expect(page.locator(".a-global-toast")).toHaveCount(1);
  await page.clock.runFor(6000);
  await expect(queue.locator("li")).toHaveCount(2);
  await page.evaluate(() => {
    (window as any).showUploaded = true;
    (window as any).refreshFiles();
  });
  await expect(queue).toContainText("Ready");
  await page.clock.runFor(1900);
  await expect(queue.locator("li")).toHaveCount(2);
  await page.clock.runFor(200);
  await expect(queue).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "one.pdf", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Dismiss completed uploads" }),
  ).toHaveCount(0);
});
test("failed uploads stay visible and can be removed from the queue", async ({
  page,
}) => {
  await page.route("https://storage.test/upload", (route) =>
    route.fulfill({
      status: 500,
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page
    .getByLabel("Upload files", { exact: true })
    .setInputFiles({
      name: "failed.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("fail"),
    });
  const queue = page.getByRole("list", { name: "Upload queue" });
  await expect(queue).toContainText("Failed");
  await expect(
    queue.getByRole("button", { name: "Retry this file" }),
  ).toBeVisible();
  await expect(page.locator(".a-global-toast")).toHaveCount(0);
  await queue.getByRole("button", { name: "Remove from queue" }).click();
  await expect(queue).toHaveCount(0);
});

test("last-row actions flip upward without extending the page and use a themed tooltip", async ({
  page,
}) => {
  for (const [mode, width, height] of [
    ["pinned", 700, 900],
    ["content", 1440, 900],
    ["pinned", 390, 400],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate((mode) => (window as any).setFileMode(mode), mode);
    const row = page.getByRole("group", { name: "proof.pdf", exact: true }),
      trigger = row.locator("summary");
    await row.evaluate((el) => {
      (el as HTMLElement).style.marginTop = "600px";
      el.scrollIntoView({ block: "end" });
    });
    await trigger.hover();
    await expect(trigger).not.toHaveAttribute("title");
    await expect(
      row.getByRole("tooltip", { name: "File actions", exact: true }),
    ).toHaveCSS("opacity", "1");
    const before = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    await trigger.click();
    const menu = page.getByRole("group", { name: "File actions", exact: true });
    const box = (await menu.boundingBox())!,
      anchor = (await trigger.boundingBox())!;
    expect(box.y).toBeLessThan(anchor.y);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBe(before);
    await expect(
      menu.getByRole("button", { name: "Rename", exact: true }),
    ).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});

test("fresh Files sessions browse names and empty-name recovery offers both modes", async ({
  page,
}) => {
  await page.evaluate(() =>
    localStorage.setItem("athyper.files.search-scope", "contents"),
  );
  await page.reload();
  await page.evaluate(bundle);
  await expect(
    page.getByRole("radio", { name: "File names", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("searchbox", { name: "Search file names", exact: true })
    .fill("not-a-file");
  await expect(
    page.getByRole("heading", { name: "No matching files", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".a-attachment-workspace__count")).toBeHidden();
  await page
    .getByRole("button", { name: "Search file contents", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "File contents", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("searchbox", { name: "Search file contents", exact: true }),
  ).toHaveValue("not-a-file");
  await page.getByRole("button", { name: "Show files", exact: true }).click();
  await page
    .getByRole("button", { name: "Show all files", exact: true })
    .click();
  await expect(
    page.getByRole("searchbox", { name: "Search file names", exact: true }),
  ).toBeEmpty();
  await expect(
    page.getByRole("heading", { name: "No matching files", exact: true }),
  ).toHaveCount(0);
});

test("full-view rows expose version history and filenames open preview", async ({
  page,
}) => {
  await page.evaluate(() => (window as any).setFileMode("content"));
  const row = page.getByRole("group", { name: "proof.pdf", exact: true });
  const history = row.getByRole("button", {
    name: "Version history",
    exact: true,
  });
  await expect(history).toBeVisible();
  await history.click();
  await expect(
    row.getByRole("button", { name: "Version history", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await row.getByRole("button", {name:"About version history"}).hover();
  await expect(page.getByRole("tooltip")).toContainText("Previous versions are retained.");
  await page.keyboard.press("Escape");
  await row.getByRole("button", { name: "proof.pdf", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Selected file preview" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/file=first/);
  await page.goBack();
  await expect(
    page.getByRole("complementary", { name: "Selected file preview" }),
  ).toHaveCount(0);
});

test("a legal hold is explained beside the archive action", async ({
  page,
}) => {
  await page.evaluate(() => (window as any).setLegalHold(true));
  const row = page.getByRole("group", { name: "proof.pdf", exact: true });
  await row.locator("summary").click();
  await page.getByRole("button", { name: "Archive file", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Archive unavailable",
    exact: true,
  });
  await expect(dialog).toContainText(
    "A legal hold blocks archive for this file.",
  );
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("history toggles in full view and closes directly in the side panel", async ({
  page,
}) => {
  const row = page.getByRole("group", { name: "proof.pdf", exact: true });
  await page
    .getByRole("button", { name: "Version history", exact: true })
    .click();
  await row.getByRole("button", { name: "Version history", exact: true }).click();
  await expect(row.locator(".a-version-note")).toHaveCount(0);
  await expect(row.getByRole("button", {name:"Version history",exact:true})).toBeFocused();
  await page.evaluate(() => (window as any).setFileMode("content"));
  await row
    .getByRole("button", { name: "Version history", exact: true })
    .click();
  const hide = row.getByRole("button", { name: "Version history", exact: true });
  await expect(hide).toHaveAttribute("aria-expanded", "true");
  await hide.click();
  await expect(row.locator(".a-version-note")).toHaveCount(0);
  await expect(
    row.getByRole("button", { name: "Version history", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
});

test("image thumbnails load only near the viewport, preserve tile size and fall back on failure", async ({
  page,
}) => {
  await page.route("https://storage.test/thumb.png", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page
    .locator(".a-attachment-workspace__list")
    .evaluate((el) => ((el as HTMLElement).style.marginTop = "2500px"));
  await page.waitForTimeout(100);
  await page.evaluate(() => { (window as any).fileCalls.length = 0; (window as any).setFileName("screenshot.png"); });
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(
      () =>
        (window as any).fileCalls.filter(
          (c: any) => c.body?.rendition === "thumbnail_sm",
        ).length,
    ),
  ).toBe(0);
  const tile = page.locator(".a-attachment-thumbnail");
  await tile.scrollIntoViewIfNeeded();
  const image = tile.locator("img");
  await expect(image).toBeVisible();
  await expect(tile).toHaveCSS("width", "40px");
  await expect(image).toHaveCSS("object-fit", "contain");
  await expect(tile.locator(".a-attachment-thumbnail__badge")).toHaveText(
    "PNG",
  );
  await image.dispatchEvent("error");
  await expect(image).toHaveCount(0);
  await expect(
    tile.getByRole("img", { name: "Image (PNG)", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => (window as any).setFileMode("content"));
  await expect(tile).toHaveCSS("width", "40px");
  await tile
    .getByRole("button", { name: "Preview screenshot.png", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Selected file preview" }),
  ).toBeVisible();
});

test("filename tooltip appears only for truncation and follows resize in both views", async ({
  page,
}) => {
  const longName =
    "workspace_configuration_" + "long-name-".repeat(25) + ".pdf";
  for (const mode of ["pinned", "content"]) {
    await page.evaluate((mode) => (window as any).setFileMode(mode), mode);
    await page.evaluate(() => (window as any).setFileName("proof.pdf"));
    const name = page.locator(".a-file-name__preview");
    await name.hover();
    await expect(
      page.getByRole("tooltip", { name: "proof.pdf", exact: true }),
    ).toHaveCount(0);
    await name.focus();
    await expect(
      page.getByRole("tooltip", { name: "proof.pdf", exact: true }),
    ).toHaveCount(0);
    await page.evaluate((name) => (window as any).setFileName(name), longName);
    await name.focus();
    const tip = page.getByRole("tooltip", { name: longName, exact: true });
    await expect(tip).toBeVisible();
    const bounds = await tip.boundingBox();
    expect(bounds!.width).toBeGreaterThan(100);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    await name.evaluate(
      (el) => ((el as HTMLElement).style.webkitLineClamp = "unset"),
    );
    await expect(tip).toHaveCount(0);
    await name.evaluate((el) =>
      (el as HTMLElement).style.removeProperty("-webkit-line-clamp"),
    );
    await expect(tip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tip).toHaveCount(0);
    await name.blur();
    await page.mouse.move(0, 0);
  }
});

test("files can be moved to Unfiled without removing their record link", async ({
  page,
}) => {
  const row = page.getByRole("group", { name: "proof.pdf", exact: true });
  await row.locator("summary").click();
  await page
    .getByRole("button", { name: "Move to folder", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Move to folder",
    exact: true,
  });
  await dialog
    .getByRole("group", { name: "Folder", exact: true })
    .getByRole("button", { name: "Unfiled (no folder)", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row.locator(".a-file-location")).toContainText("Unfiled");
  expect(
    await page.evaluate(
      () =>
        (window as any).fileCalls.find((c: any) => c.body?.command === "move")
          .body.folderId,
    ),
  ).toBeNull();
  await page
    .getByRole("navigation", { name: "Record folders" })
    .getByRole("button", { name: "Unfiled", exact: true })
    .click();
  await expect(row).toBeVisible();
});

test("collapsing upload controls retains validation feedback and drag reveals the target",async({page})=>{
  const zone=page.getByRole('region',{name:'File upload drop zone'});
  await page.getByLabel('Upload files',{exact:true}).setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('bad')});
  await expect(zone.getByRole('alert')).toBeVisible();
  await page.getByRole('button',{name:'＋ Add files',exact:true}).click();
  await expect(zone.getByRole('alert')).toBeVisible();
  await expect(zone.getByText('Drag and drop files here',{exact:true})).toBeHidden();
  const data=await page.evaluateHandle(()=>{const data=new DataTransfer();data.items.add(new File(['pdf'],'proof.pdf',{type:'application/pdf'}));return data;});
  await page.locator('.a-attachment-workspace').dispatchEvent('dragenter',{dataTransfer:data});
  await expect(zone.getByText('Drag and drop files here',{exact:true})).toBeVisible();
});

for (const [mode,width] of [['content',1440],['content',1024],['content',768],['content',390],['content',320],['pinned',1440]] as const) test(`compact file controls adapt to ${mode} at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.evaluate(mode=>(window as any).setFileMode(mode),mode);
  await page.getByRole('button',{name:'＋ Add files',exact:true}).click();
  const search=page.getByRole('searchbox');
  const add=page.getByRole('button',{name:'＋ Add files',exact:true});
  const names=page.getByRole('radio',{name:'File names',exact:true});
  await names.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio',{name:'File contents',exact:true})).toBeChecked();
  await page.keyboard.press('ArrowLeft');
  await expect(names).toBeChecked();
  const segment=names.locator('xpath=..');
  const segmentBox=(await segment.boundingBox())!,fillBox=(await segment.locator('span').boundingBox())!;
  expect(Math.abs(segmentBox.y-fillBox.y)).toBeLessThan(1);
  expect(Math.abs(segmentBox.height-fillBox.height)).toBeLessThan(1);
  if(mode==='content' && width===1440) {
    expect((await add.boundingBox())!.width).toBeGreaterThanOrEqual(240);
    expect((await add.boundingBox())!.width).toBeLessThanOrEqual(280);
  }
  const searchBox=(await search.boundingBox())!,addBox=(await add.boundingBox())!;
  if(mode==='content' && width>=1024) expect(Math.abs(searchBox.y-addBox.y)).toBeLessThan(12);
  else expect(addBox.y).toBeGreaterThan(searchBox.y+searchBox.height);
  await expect(page.locator('.a-attachment-workspace__count')).toContainText('file');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(const button of [add,page.getByRole('button',{name:'Filters',exact:true}),page.getByRole('button',{name:'New folder',exact:true})]) {
    const box=(await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(40);
    expect(box.height).toBeGreaterThanOrEqual(40);
  }
  await page.screenshot({path:`/tmp/compact-files-${mode}-${width}.png`});
});

for (const mode of ['content','pinned'] as const) test(`upload disclosure keeps its trigger stable in ${mode}`,async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(mode=>{(window as any).setFileMode(mode);document.documentElement.dataset.theme='dark';},mode);
  const add=page.getByRole('button',{name:'＋ Add files',exact:true});
  await expect(add).toHaveAttribute('aria-expanded','true');
  await add.click();
  await expect(add).toHaveAttribute('aria-expanded','false');
  const before=(await add.boundingBox())!;
  const closedColor=await add.evaluate(el=>getComputedStyle(el).backgroundColor);
  await add.click();
  await expect(add).toHaveAttribute('aria-expanded','true');
  expect(Math.abs((await add.boundingBox())!.y-before.y)).toBeLessThan(1);
  expect(Math.abs((await add.boundingBox())!.width-before.width)).toBeLessThan(1);
  expect(await add.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(closedColor);
  const target=page.locator('.a-files-upload-area');
  expect((await target.boundingBox())!.y).toBeGreaterThanOrEqual(before.y+before.height);
  expect((await target.boundingBox())!.y+(await target.boundingBox())!.height).toBeLessThanOrEqual((await page.locator('.a-files-browse-summary').boundingBox())!.y);
  await expect(target).toHaveAttribute('id',(await add.getAttribute('aria-controls'))!);
  await page.screenshot({path:`/tmp/files-disclosure-${mode}-dark.png`});
});

for (const mode of ["content", "pinned"]) test(`single-version history stays closable and shows attribution in ${mode}`, async ({page}) => {
  await page.evaluate(mode => { (window as any).singleVersion=true; (window as any).setFileName("single.pdf"); (window as any).setFileMode(mode); },mode);
  const row=page.getByRole("group",{name:"single.pdf",exact:true});
  await expect(row).toContainText("Added by Record Contributor");
  const toggle=row.getByRole("button",{name:"Version history",exact:true});
  await toggle.click();
  const history=row.getByRole("list",{name:"Version history",exact:true});
  await expect(history.locator(":scope > li")).toHaveCount(1);
  await expect(history).toContainText("Uploaded by Version Uploader");
  await expect(toggle).toHaveAttribute("aria-expanded","true");
  await toggle.click();await expect(history).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-expanded","false");await expect(toggle).toBeFocused();
});

test("mixed upload results show one warning with a review action", async ({ page }) => {
  let uploads = 0;
  await page.route('https://storage.test/upload', route => {
    uploads++;
    return route.fulfill({ status: uploads === 1 ? 200 : 500, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.getByLabel('Upload files', { exact: true }).setInputFiles([
    { name: 'success.pdf', mimeType: 'application/pdf', buffer: Buffer.from('one') },
    { name: 'failed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('two') },
  ]);
  const toast = page.locator('.a-global-toast');
  await expect(toast).toHaveCount(1);
  await expect(toast).toHaveClass(/a-toast--warning/);
  await expect(toast).toContainText('Some uploads failed');
  await toast.getByRole('button', { name: 'Review uploads', exact: true }).click();
  const queue = page.getByRole('list', { name: 'Upload queue' });
  await expect(queue).toBeFocused();
  await expect(queue).toContainText('failed.pdf');
  await expect(toast).toHaveCount(0);
});


test("terminal PDF inspection failure appears once with removal instead of retry", async ({ page }) => {
  await page.evaluate(() => (window as any).inspectionFailure = true);
  await page.route('https://storage.test/upload', route => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' } }));
  await page.getByLabel('Upload files', { exact: true }).setInputFiles({ name: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('pdf') });
  const queue = page.getByRole('list', { name: 'Upload queue' });
  await expect(queue).toContainText('Inspection unsupported');
  await expect(queue).not.toContainText('Malware detected');
  await expect(page.getByText(/This PDF uses an unsupported decoding method/)).toHaveCount(1);
  await expect(queue.getByRole('button', { name: 'Retry this file' })).toHaveCount(0);
  await expect(page.locator('.a-global-toast')).toHaveCount(0);
  await queue.getByRole('button', { name: 'Remove from queue' }).click();
  await expect(queue).toHaveCount(0);
});


test("a positive malware verdict has a distinct upload status", async ({ page }) => {
  await page.evaluate(() => (window as any).malwareFailure = true);
  await page.route('https://storage.test/upload', route => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' } }));
  await page.getByLabel('Upload files', { exact: true }).setInputFiles({ name: 'unsafe.pdf', mimeType: 'application/pdf', buffer: Buffer.from('fixture') });
  const queue = page.getByRole('list', { name: 'Upload queue' });
  await expect(queue).toContainText('Malware detected');
  await expect(queue).not.toContainText('Inspection unsupported');
  await expect(queue.getByRole('button', { name: 'Retry this file' })).toHaveCount(0);
});


test("PDF thumbnail waits for generation and preserves the PDF badge and viewer", async ({ page }) => {
  await page.clock.install();
  await page.route('https://storage.test/thumb.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') }));
  const list = page.locator('.a-attachment-workspace__list');
  await list.evaluate(el => (el as HTMLElement).style.marginTop = '2500px');
  await page.clock.runFor(100);
  await page.evaluate(() => { (window as any).fileCalls.length = 0; (window as any).thumbnailProcessing = true; (window as any).setFileName('invoice.pdf'); });
  await page.clock.runFor(100);
  expect(await page.evaluate(() => (window as any).fileCalls.filter((c: any) => c.body?.rendition === 'thumbnail_sm').length)).toBe(0);
  const tile = page.locator('.a-attachment-thumbnail');
  await tile.scrollIntoViewIfNeeded();
  await expect(tile.getByRole('status')).toBeVisible();
  await page.evaluate(() => (window as any).thumbnailProcessing = false);
  await page.clock.runFor(1100);
  await expect(tile.locator('img')).toBeVisible();
  await expect(tile.locator('.a-attachment-thumbnail__badge')).toHaveText('PDF');
  await expect(tile).toHaveCSS('width', '40px');
  await tile.locator('img').dispatchEvent('error');
  await expect(tile.getByRole('img', { name: 'PDF (PDF)', exact: true })).toBeVisible();
  await tile.getByRole('button', { name: 'Preview invoice.pdf', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Selected file preview' })).toBeVisible();
});

test("upload requirements and early validation use the record capability", async ({ page }) => {
  await page.route('https://storage.test/upload', route => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' } }));
  const zone = page.getByRole('region', { name: 'File upload drop zone' });
  const picker = page.getByLabel('Upload files', { exact: true });
  await expect(picker).toHaveAttribute('accept', 'application/pdf,image/png');
  await expect(zone).toContainText('PDF, PNG');
  await expect(zone).toContainText('Up to 1 KB per file');
  await picker.setInputFiles([
    { name: 'oversized.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(2048) },
    { name: 'unsupported.txt', mimeType: 'text/plain', buffer: Buffer.from('text') },
    { name: 'valid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('valid') },
  ]);
  const errors = zone.getByRole('alert');
  await expect(errors).toContainText('“oversized.pdf” is 2 KB; the limit is 1 KB per file.');
  await expect(errors).toContainText('“unsupported.txt” cannot be uploaded. Choose PDF, PNG.');
  await expect.poll(() => page.evaluate(() => (window as any).stagedFiles?.map((f: any) => f.fileName))).toEqual(['valid.pdf']);
});

 test("encrypted PDF explains how to recover without retrying or labelling malware", async ({page}) => {
   await page.evaluate(() => (window as any).encryptedPdfFailure = true);
   await page.route('https://storage.test/upload', route => route.fulfill({status:200,headers:{'access-control-allow-origin':'*'}}));
   await page.getByLabel('Upload files',{exact:true}).setInputFiles({name:'protected.pdf',mimeType:'application/pdf',buffer:Buffer.from('fixture')});
   const queue=page.getByRole('list',{name:'Upload queue'});
   await expect(queue).toContainText('Export an unencrypted copy and try again.');
   await expect(queue).not.toContainText('Malware detected');
   await expect(queue.getByRole('button',{name:'Retry this file'})).toHaveCount(0);
   await queue.getByRole('button',{name:'Remove from queue'}).click();
   await expect(queue).toHaveCount(0);
 });
