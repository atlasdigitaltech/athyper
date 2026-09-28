import { buildSync } from "esbuild";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
test("shared composer sends the comment previously covered by the retired BP shell", async ({ page }) => {
  const editor = page.getByRole("textbox", { name: "Comment", exact: true });
  await editor.fill("Reviewed certificate renewal.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).commentCalls
    .find((call: any) => call.method === "POST" && call.path.endsWith("/comments"))?.body.text))
    .toBe("Reviewed certificate renewal.");
  await expect(editor).toHaveCount(0);
  await page.getByRole("button",{name:"＋ Add comment",exact:true}).click();
  await expect(editor).toBeEmpty();
});
test("mentions use server matching threads and independent pagination",async({page})=>{
  await page.getByRole("button",{name:"Mentions",exact:true}).click();
  await expect(page.getByText("Mention exists in a visible reply",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Load more mentions",exact:true}).click();
  await expect(page.getByText("Second mentioned thread",{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).commentCalls.filter((call:any)=>call.path==="mentions-page").map((call:any)=>call.cursor??null))).toEqual([null,"next-mentions"]);
});
test("mention-only paste autosaves without deleting the draft",async({page})=>{
  const editor=page.locator(".a-comment-composer-card").getByRole("textbox",{name:"Comment",exact:true});
  await editor.evaluate(element=>{
    const data=new DataTransfer();
    data.setData("application/x-athyper-rich-text+json",JSON.stringify({type:"doc",schema:"athyper.rich-text/1.0",content:[{type:"paragraph",content:[{type:"mention",attrs:{principalId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",label:"Ada"}}]}]}));
    element.dispatchEvent(new ClipboardEvent("paste",{clipboardData:data,bubbles:true,cancelable:true}));
  });
  await expect.poll(()=>page.evaluate(()=>(window as any).commentCalls.find((call:any)=>call.path.endsWith("/drafts")&&call.method==="POST")?.body.text)).toBe("@Ada");
  expect(await page.evaluate(()=>(window as any).commentCalls.filter((call:any)=>call.path.endsWith("/drafts")&&call.method==="DELETE").length)).toBe(0);
});
test("image paste prepares a draft and blocks a concurrent picker submission",async({page})=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let stages=0;
  await page.route("**/api/relay/attachments/**",async route=>{if(route.request().url().endsWith("/stage")){stages++;await gate;await route.fulfill({json:{attachmentId:route.request().postDataJSON().attachmentId,uploadUrl:"https://storage.test/paste"}});}else await route.fulfill({json:{status:"active"}});});
  await page.route("https://storage.test/paste",route=>route.fulfill({status:200,headers:{"access-control-allow-origin":"*"}}));
  const composer=page.locator(".a-comment-composer-card");
  await composer.getByRole("textbox",{name:"Comment",exact:true}).evaluate(element=>{const data=new DataTransfer();data.items.add(new File(["png"],"pasted.png",{type:"image/png"}));element.dispatchEvent(new ClipboardEvent("paste",{clipboardData:data,bubbles:true,cancelable:true}));});
  await expect.poll(()=>stages).toBe(1);await expect(composer.getByRole("button",{name:"Send",exact:true})).toBeDisabled();
  await composer.getByLabel("Choose comment attachments").setInputFiles({name:"concurrent.pdf",mimeType:"application/pdf",buffer:Buffer.from("pdf")});
  expect(stages).toBe(1);release();await expect(composer.getByRole("list",{name:"Comment attachments"}).getByRole("listitem")).toHaveCount(1);
});
test("refresh preserves eight loaded reply pages",async({page})=>{
  await page.evaluate(()=>{(window as any).eightPages=true;(window as any).setReplyCount(8);});
  await page.getByRole("button",{name:/Show.*repl/i}).click();
  for(let n=2;n<=8;n++){await page.getByRole("button",{name:"Load more replies"}).click();await expect(page.getByText(`Reply page ${n}`,{exact:true})).toBeVisible();}
  await page.getByRole("button",{name:"Like comment",exact:true}).first().click();
  await expect(page.getByText("Reply page 8",{exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).commentCalls.filter((c:any)=>c.path==="thread-page").length)).toBeGreaterThanOrEqual(16);
});
const fixture = resolve(
  "tooling/scripts/verification/comment-actions-browser-fixture.tsx",
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
  "packages/platform/foundation/ui/src/composer-frame/styles.css",
  "packages/platform/entity/runtime/form-detail/src/styles.css",
]
  .map((path) => readFileSync(path, "utf8").replace(/@import[^;]+;/g, ""))
  .join("\n");
test.beforeEach(async ({ page }) => {
  await page.route("https://comments.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html><head><style>${css}</style></head><body><div id="root"></div></body></html>`,
    }),
  );
  await page.goto("https://comments.test/");
  await page.evaluate(bundle);
  await page.getByRole("button",{name:/Add (the first )?comment/}).click();
});
test("audience selection is keyboard accessible, capability limited and saved in the draft", async ({
  page,
}) => {
  const composer = page.locator(".a-comment-composer-card");
  await composer
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Private draft");
  await composer.getByRole("button", { name: "Audience: Public" }).click();
  await expect(
    page.getByRole("menuitemradio", { name: /Internal/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("menuitemradio", { name: /Public/ }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(
    composer.getByRole("button", { name: "Audience: Private" }),
  ).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).commentCalls
            .filter((call: any) => call.path.endsWith("/drafts"))
            .at(-1)?.body.visibility,
      ),
    )
    .toBe("private");
  await expect(composer).toBeInViewport();
});
test("edit errors preserve text; report/history open focused dialogs and reactions show a count", async ({
  page,
}) => {
  const item = page.locator(".a-comment-item");
  await item.getByRole("button", { name: "Like comment", exact: true }).click();
  await expect(
    item.getByRole("button", { name: "Remove like", exact: true }),
  ).toContainText("1");
  await item
    .getByRole("button", { name: "Remove like", exact: true })
    .click();
  await expect(
    item.getByRole("button", { name: "Like comment", exact: true }),
  ).not.toContainText("1");
  const action = async (name: string) => {
    await item.locator("summary").click();
    await item.getByRole("button", { name, exact: true }).click();
  };
  await action("Edit");
  let dialog = page.getByRole("region", { name: "Edit comment", exact: true });
  await expect(page.getByRole("dialog", {name:"Edit comment",exact:true})).toHaveCount(0);
  await expect(dialog.getByRole("button", {name:"Review latest saved revision"})).toHaveCount(0);
  const editor = dialog.getByRole("textbox", { name: "Comment", exact: true });
  await editor.fill("Unsaved edit");
  await page.evaluate(() => {
    (window as any).editFails = true;
  });
  await dialog
    .getByRole("button", { name: "Save comment", exact: true })
    .click();
  await expect(editor).toHaveText("Unsaved edit");
  await expect(dialog.getByRole("alert")).toHaveCount(1);
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog
    .getByRole("button", { name: "Review latest saved revision" })
    .click();
  await expect(dialog).toContainText("Latest saved revision");
  await dialog
    .getByRole("button", {
      name: "Use reviewed revision and keep my unsaved text",
    })
    .click();
  await page.evaluate(() => {
    (window as any).editFails = false;
  });
  await dialog
    .getByRole("button", { name: "Save comment", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(item).toContainText("Unsaved edit");
  await expect(item.getByText("Edited", { exact: true })).toBeVisible();
  await action("History");
  dialog = page.getByRole("dialog", { name: "Comment history", exact: true });
  await expect(dialog).toContainText("Revision 2");
  await dialog.getByRole("button", { name: "Close history" }).click();
  await action("Report comment");
  dialog = page.getByRole("dialog", { name: "Report comment", exact: true });
  await expect(dialog.getByRole("button",{name:"Submit report"})).toBeDisabled();
  await dialog.getByLabel("Reason",{exact:true}).selectOption("spam");
  await dialog.getByLabel("Additional context (optional)").fill("Review this fixture");
  await dialog.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByText("Report submitted for review",{exact:true})).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(item.getByText("Report pending review",{exact:true})).toBeVisible();
  await action("View your report");
  const report=page.getByRole("dialog",{name:"Your report",exact:true});
  await expect(report).toContainText("Spam");
  await expect(report).toContainText("Review this fixture");
  await expect(report).toContainText("No reviewer response has been shared.");
  await report.getByRole("button",{name:"Close",exact:true}).click();
  await item.locator("summary").click();
  await expect(item.getByRole("button",{name:"Report comment",exact:true})).toHaveCount(0);
  await item.locator("summary").click();
  await item.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(page.locator(".a-comment-compose-slot").getByText("Reply to Test Author", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel reply", exact: true }).click();
});

test("PDF picker pins a draft-scoped file and preserves it while editing", async ({
  page,
}) => {
  const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const stages: any[] = [];
  await page.route("**/api/relay/attachments/**", async (route) => {
    if (route.request().url().endsWith("/stage")) {
      stages.push(route.request().postDataJSON());
      await route.fulfill({
        json: { attachmentId: route.request().postDataJSON().attachmentId, uploadUrl: "https://storage.test/upload" },
      });
    } else await route.fulfill({ json: { status: "active" } });
  });
  await page.route("https://storage.test/upload", (route) =>
    route.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  const composer = page.locator(".a-comment-composer-card");
  await expect(
    composer.getByRole("button", { name: "Attach files to comment" }),
  ).toBeVisible();
  await composer
    .getByLabel("Choose comment attachments")
    .setInputFiles({
      name: "proof.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-fixture"),
    });
  await expect(
    composer.getByRole("list", { name: "Comment attachments" }),
  ).toContainText("proof.pdf");
  expect(stages[0].draftId).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  const item = page.locator(".a-comment-item");
  await item.locator("summary").click();
  await item.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("region", { name: "Edit comment" });
  await dialog
    .getByLabel("Choose comment attachments")
    .setInputFiles({
      name: "edit.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-fixture"),
    });
  await expect(
    dialog.getByRole("list", { name: "Comment attachments" }),
  ).toContainText("edit.pdf");
  await dialog.getByRole("button", { name: "Save comment" }).click();
  const edit = await page.evaluate(
    () =>
      (window as any).commentCalls.find((call: any) => call.method === "PATCH")
        .body,
  );
  expect(edit.attachmentIds).toEqual([stages[1].attachmentId]);
  const drafts=await page.evaluate(()=>(window as any).commentCalls.filter((call:any)=>call.path.endsWith("/drafts")));
  expect(drafts.find((call:any)=>call.method==="POST" && call.body.contextType?.startsWith("entity_edit_"))).toBeTruthy();
  expect(drafts.find((call:any)=>call.method==="DELETE").query.contextType).toMatch(/^entity_edit_/);
  await expect(composer.getByRole("list",{name:"Comment attachments"})).toContainText("proof.pdf");
  expect(
    edit.content.content.some((node: any) => node.type === "attachmentFile"),
  ).toBe(true);
});

test("category and folder selections require explicit Save and Cancel is nonmutating", async ({
  page,
}) => {
  await page.evaluate(() => (window as any).showFiles());
  const menu = page.locator(".a-attachment-card summary");
  await menu.click();
  await page.getByRole("button", { name: "Set category", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Set category" });
  await dialog
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("evidence");
  expect(
    await page.evaluate(() =>
      (window as any).commentCalls.filter(
        (call: any) => call.method === "POST",
      ),
    ),
  ).toHaveLength(0);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await menu.click();
  await page
    .getByRole("button", { name: "Move to folder", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Move to folder" });
  await dialog
    .getByRole("combobox", { name: "Folder", exact: true })
    .selectOption("folder");
  expect(
    await page.evaluate(() =>
      (window as any).commentCalls.filter(
        (call: any) => call.method === "POST",
      ),
    ),
  ).toHaveLength(0);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const call = await page.evaluate(() =>
    (window as any).commentCalls.find((call: any) =>
      call.path.endsWith("/folders"),
    ),
  );
  expect(call.body).toMatchObject({
    command: "move",
    folderId: "folder",
    attachmentId: "file",
  });
});

test("comment empty state, reply count and composer controls are aligned",async({page})=>{
  await expect(page.getByText("No replies",{exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Show replies",exact:true})).toHaveCount(0);
  await page.evaluate(()=>(window as any).setReplyCount(2));
  const show=page.getByRole("button",{name:"Show 2 replies",exact:true});
  await expect(show).toBeVisible();
  const reply=page.getByRole("button",{name:"Reply",exact:true}).first();
  expect(Math.abs((await show.boundingBox())!.y-(await reply.boundingBox())!.y)).toBeLessThan(5);
  await show.click();await expect(page.getByRole("button",{name:"Hide 2 replies"})).toBeVisible();
  await reply.click();
  const dialog=page.locator(".a-comment-compose-slot");
  await expect(page.getByRole("dialog",{name:"Reply to comment",exact:true})).toHaveCount(0);
  const cancel=dialog.getByRole("button",{name:"Cancel reply",exact:true}),send=dialog.getByRole("button",{name:"Send reply",exact:true}),audience=dialog.getByRole("button",{name:"Audience: Public",exact:true});
  expect(Math.abs((await cancel.boundingBox())!.y-(await send.boundingBox())!.y)).toBeLessThan(5);
  expect((await send.boundingBox())!.x).toBeGreaterThan((await cancel.boundingBox())!.x);
  expect(Math.abs((await audience.boundingBox())!.y-(await send.boundingBox())!.y)).toBeLessThan(5);
  const attach=dialog.getByRole("button",{name:"Attach files to comment",exact:true});
  await attach.hover();await expect(dialog.getByRole("tooltip",{name:"Attach files",exact:true})).toHaveCSS("opacity","1");
  await expect(attach).not.toHaveAttribute("title");
  const mention=dialog.locator('summary[aria-label="Mention a participant"]');
  await mention.hover();await expect(dialog.getByRole("tooltip",{name:"Mention a participant",exact:true})).toHaveCSS("opacity","1");
  await expect(mention).not.toHaveAttribute("title");
  await send.evaluate(el=>(el as HTMLButtonElement).disabled=true);
  const colors=await send.evaluate(el=>({text:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor,opacity:getComputedStyle(el).opacity}));
  expect(colors.text).not.toBe(colors.background);expect(colors.opacity).toBe("1");
  await send.evaluate(el=>(el as HTMLButtonElement).disabled=false);
  await cancel.click();await page.evaluate(()=>(window as any).emptyComments());
  await expect(page.getByRole("heading",{name:"No comments yet",exact:true})).toBeVisible();
  await page.screenshot({path:"/tmp/comments-empty-polish.png"});
});

test("one bottom composer preserves new-comment and reply drafts and shows flat descendants",async({page})=>{
  const editor=page.getByRole("textbox",{name:"Comment",exact:true});
  await editor.fill("Unfinished new comment");
  await page.evaluate(()=>(window as any).setReplyCount(2));
  await page.locator(".a-comment-item").first().getByRole("button",{name:"Reply",exact:true}).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(editor).toHaveCount(1);await expect(editor).toBeFocused();
  await expect(page.locator(".a-comment-reply-excerpt")).toContainText("Original comment");
  await editor.fill("Unfinished reply");
  await page.getByRole("button",{name:"Cancel reply",exact:true}).click();
  await expect(editor).toContainText("Unfinished new comment");
  await page.locator(".a-comment-item").first().getByRole("button",{name:"Reply",exact:true}).click();
  await expect(editor).toContainText("Unfinished reply");
  await expect(page.locator(".a-comment-reply-group .a-comment-item")).toHaveCount(2);
  await expect(page.locator(".a-comment-reply-group .a-comment-reply-group")).toHaveCount(0);
  const child=page.locator("#comment-reply-fixture");
  await child.getByRole("button",{name:"Reply",exact:true}).click();
  await expect(editor).toBeEmpty();await editor.fill("Nested reply");
  await page.getByRole("button",{name:"Send reply",exact:true}).click();
  await page.getByRole("button",{name:"Resume draft",exact:true}).click();
  await expect(page.getByRole("button",{name:"Send",exact:true})).toBeVisible();
  await expect(editor).toContainText("Unfinished new comment");
  expect(await page.evaluate(()=>(window as any).commentCalls.some((call:any)=>call.path.endsWith("/reply-fixture/replies")))).toBe(true);
});

test("pinned comment files use one compact card and load previews only when opened", async ({ page }) => {
  await page.evaluate(() => (window as any).pinCommentFile());
  const card = page.locator(".a-comment-file");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("2 KB · v2");
  await expect(page.getByText("[Attachment: proof.pdf]", { exact: true })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Download proof.pdf", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).commentCalls.filter((call:any) => call.path.endsWith("/preview")).length)).toBe(0);
  await card.getByRole("button", { name: "Preview proof.pdf", exact: true }).click();
  await expect(card.getByText("Fixture preview unavailable")).toBeVisible();
  await card.getByRole("button", { name: "Close preview", exact: true }).click();
  await expect(card.locator(".a-comment-file__preview")).toHaveCount(0);
});

test("comments group by author while sort order applies within each group", async ({ page }) => {
  await page.evaluate(() => (window as any).groupComments());
  const content=page.locator('.a-comment-thread > .a-comment-item .a-comment-content');
  await expect(content).toHaveText(['Early Bob','Alice comment','Late Bob']);
  await page.getByRole('combobox',{name:'Group comments by',exact:true}).selectOption('user');
  await expect(content).toHaveText(['Alice comment','Early Bob','Late Bob']);
  await expect(page.locator('.a-comment-date-divider')).toHaveText(['Alice','Bob']);
  await page.getByRole('combobox',{name:'Comment order',exact:true}).selectOption('newest');
  await expect(content).toHaveText(['Alice comment','Late Bob','Early Bob']);
  await page.getByRole('combobox',{name:'Group comments by',exact:true}).selectOption('date');
  await expect(content).toHaveText(['Late Bob','Alice comment','Early Bob']);
});

for (const activation of ['pointer','keyboard']) test(`inline edit cancels without changing the comment or the bottom draft (${activation})`, async ({page}) => {
  const draft=page.locator('.a-comment-compose-slot').getByRole('textbox',{name:'Comment',exact:true});
  await draft.fill('Keep my new comment draft');
  const item=page.locator('.a-comment-item');
  await item.locator('summary').click();
  await item.getByRole('button',{name:'Edit',exact:true}).click();
  const edit=item.getByRole('region',{name:'Edit comment',exact:true});
  await edit.getByRole('textbox',{name:'Comment',exact:true}).fill('Discard this edit');
  await expect(edit.getByRole('button',{name:'Review latest saved revision'})).toHaveCount(0);
  const cancel=edit.getByRole('button',{name:'Cancel editing',exact:true});
  if(activation==='keyboard') { await cancel.focus(); await page.keyboard.press('Enter'); }
  else await cancel.click();
  await expect(edit).toHaveCount(0);
  await page.waitForTimeout(700);
  await expect(page.getByRole('tooltip',{name:'Comment actions',exact:true})).toHaveCount(0);
  await expect(item).toBeFocused();
  await expect(item).toContainText('Original comment');
  await expect(draft).toHaveText('Keep my new comment draft');
  expect(await page.evaluate(()=>(window as any).commentCalls.filter((call:any)=>call.method==='PATCH').length)).toBe(0);
  await page.keyboard.press('Tab');
  await expect(item.locator('summary')).toBeFocused();
  await expect(page.getByRole('tooltip',{name:'Comment actions',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip',{name:'Comment actions',exact:true})).toHaveCount(0);
  await expect(item.locator('details')).not.toHaveAttribute('open','');
});

test("comment deletion confirms, keeps failures local and exposes only deletion metadata",async({page})=>{
  const item=page.locator('.a-comment-item');
  const open=async()=>{await item.locator('summary').click();await item.getByRole('button',{name:'Delete',exact:true}).click();};
  await open();
  const dialog=page.getByRole('dialog',{name:'Delete comment?',exact:true});
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).commentCalls.filter((call:any)=>call.method==='DELETE').length)).toBe(0);
  await open();await page.evaluate(()=>(window as any).deleteFails=true);
  await dialog.getByRole('button',{name:'Delete comment',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Delete failed');
  await expect(item).toContainText('Original comment');
  await page.evaluate(()=>(window as any).deleteFails=false);
  await dialog.getByRole('button',{name:'Delete comment',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(item).toContainText('Comment deleted');
  await expect(item).not.toContainText('Original comment');
  await item.getByRole('button',{name:'View deletion details',exact:true}).click();
  const history=page.getByRole('dialog',{name:'Comment history',exact:true});
  await expect(history).toContainText('Previous comment content is unavailable after deletion');
  await expect(history).not.toContainText('Original comment');
});

test("comment layouts wrap narrow content and keep the full-view composer in flow",async({page})=>{
  await page.evaluate(()=>(window as any).pinCommentFile());
  const panel=page.locator('.a-collaboration-panel');
  await panel.evaluate(el=>(el as HTMLElement).style.width='360px');
  await page.locator('.a-comment-file__name').evaluate(el=>el.textContent='evidence_'+ 'x'.repeat(160)+'.pdf');
  const feed=page.locator('.a-comment-feed');
  expect(await feed.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  await panel.evaluate(el=>{(el as HTMLElement).dataset.mode='content';(el as HTMLElement).style.width='850px';(el as HTMLElement).style.height='auto';});
  await expect(page.locator('.a-comment-compose-slot')).toHaveCSS('position','static');
  await expect(page.locator('.a-comment-thread')).toHaveCSS('border-top-style','solid');
  const last=await page.locator('.a-comment-thread').last().boundingBox();
  const composer=await page.locator('.a-comment-compose-slot').boundingBox();
  expect(composer!.y).toBeGreaterThanOrEqual(last!.y+last!.height);
});

test("reply references identify the exact parent and deletion and depth limits stay compact",async({page})=>{
  await page.evaluate(()=>(window as any).setReplyCount(2));
  await page.getByRole('button',{name:'Show 2 replies',exact:true}).click();
  const nested=page.locator('#comment-nested-fixture');
  await expect(nested.getByRole('button',{name:'Replying to Test Author: “A reply”',exact:true})).toBeVisible();
  await nested.getByRole('button',{name:'Replying to Test Author: “A reply”',exact:true}).click();
  await expect(page.locator('#comment-reply-fixture')).toBeFocused();
  await page.evaluate(()=>(window as any).setReplyItems([
    {id:'deep',authorDisplayName:'Test Author',authorId:'owner',text:'Deep reply',createdAt:'2026-09-22T06:00:00Z',threadDepth:5,parentCommentId:'missing-parent',replyToDeleted:true,replyToExcerpt:'Must not appear',visibility:'public'},
    {id:'removed',authorDisplayName:'Test Author',authorId:'owner',createdAt:'2026-09-22T06:01:00Z',threadDepth:2,parentCommentId:'missing-parent',replyToName:'Test Author',replyToExcerpt:'Earlier reply',tombstone:true,visibility:'public'}
  ]));
  const deep=page.locator('#comment-deep');
  await expect(deep).toContainText('Maximum reply depth reached');
  await expect(deep).not.toContainText('Must not appear');
  const before=await page.evaluate(()=>(window as any).commentCalls.filter((x:any)=>x.path==='thread-page').length);
  await deep.getByRole('button',{name:'Replying to a deleted comment',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'The parent comment is not loaded'})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).commentCalls.filter((x:any)=>x.path==='thread-page').length)).toBe(before);
  await deep.getByRole('button',{name:'Reply to main comment',exact:true}).click();
  await expect(page.locator('.a-comment-reply-excerpt')).toContainText('Original comment');
  const removed=page.locator('#comment-removed');
  await expect(removed.locator('.a-comment-tombstone')).toContainText('Comment deleted');
  await expect(removed.locator('.a-comment-tombstone').getByRole('button',{name:'View deletion details'})).toBeVisible();
  await expect(removed.locator('.a-comment-item__actions')).toBeHidden();
});

test("compact comment editors grow, scroll at the cap, and use compact edit actions", async ({page}) => {
  const editor=page.locator('.a-comment-compose-slot [data-composer-editor]');
  const height=()=>editor.evaluate(el=>el.getBoundingClientRect().height);
  expect(await height()).toBeGreaterThanOrEqual(48);
  expect(await height()).toBeLessThanOrEqual(56);
  await editor.fill('First line\nSecond line\nThird line');
  expect(await height()).toBeGreaterThan(56);
  await editor.fill(Array.from({length:30},(_,i)=>`Line ${i}`).join('\n'));
  expect(await height()).toBeLessThanOrEqual(200);
  expect(await editor.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  await editor.fill('');
  expect(await height()).toBeLessThanOrEqual(56);
  const item=page.locator('.a-comment-item').first();
  await item.locator('summary').click();
  await item.getByRole('button',{name:'Edit',exact:true}).click();
  const edit=item.getByRole('region',{name:'Edit comment',exact:true});
  await expect(edit.locator('.a-composer-frame__header')).toHaveText('Edit commentPublic');
  await expect(edit.getByRole('button',{name:'Save comment',exact:true})).toHaveText('Save changes');
});

test("edit supports audience-scoped mentions and explains locked visibility", async ({page}) => {
  const item=page.locator('.a-comment-item').first();
  await item.locator('summary').click();
  await item.getByRole('button',{name:'Edit',exact:true}).click();
  const edit=item.getByRole('region',{name:'Edit comment',exact:true});
  await expect(edit.getByRole('button',{name:'Audience: Public'})).toHaveCount(0);
  await expect(edit.getByRole('textbox',{name:'Comment',exact:true})).toBeFocused();
  const audience=edit.locator('.a-rich-comment-composer__locked-audience');
  await expect(edit.locator('.a-composer-frame__header .a-rich-comment-composer__locked-audience')).toHaveText('Public');
  await expect(edit.locator('.a-composer-frame__footer .a-rich-comment-composer__audience')).toHaveCount(0);
  await expect(edit.locator('.a-composer-frame__footer .a-rich-comment-composer__locked-audience')).toHaveCount(0);
  const close=edit.getByRole('button',{name:'Minimize composer',exact:true});
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:900});
    const badgeBox=await audience.boundingBox(),closeBox=await close.boundingBox();
    expect(badgeBox!.x+badgeBox!.width).toBeLessThan(closeBox!.x);
    expect(Math.abs(badgeBox!.y+badgeBox!.height/2-closeBox!.y-closeBox!.height/2)).toBeLessThan(2);
  }
  await audience.focus();
  await expect(edit.getByRole('tooltip',{name:'Visibility cannot be changed after posting.'})).toHaveCSS('opacity','1');
  await page.keyboard.press('Escape');
  await expect(edit.getByRole('tooltip')).toHaveCount(0);
  await edit.locator('summary[aria-label="Mention a participant"]').click();
  await edit.getByRole('textbox',{name:'Mention a participant',exact:true}).fill('Alex');
  await edit.getByRole('button',{name:'Alex Reviewer',exact:true}).click();
  await expect(edit.getByRole('textbox',{name:'Comment',exact:true})).toContainText('@Alex Reviewer');
  await edit.getByRole('button',{name:'Save comment',exact:true}).click();
  const calls=await page.evaluate(()=>(window as any).commentCalls);
  expect(calls.some((c:any)=>c.path.includes('/participants?')&&c.path.includes('visibility=public'))).toBe(true);
  const patch=calls.find((c:any)=>c.method==='PATCH');
  expect(JSON.stringify(patch.body.content)).toContain('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  expect(patch.body.visibility).toBeUndefined();
});

test("attachment download tooltip stays readable within the viewport in both modes",async({page})=>{
  await page.evaluate(()=>(window as any).pinCommentFile());
  for(const mode of ['pinned','content']) {
    await page.locator('.a-collaboration-panel').evaluate((el,mode)=>(el as HTMLElement).dataset.mode=mode,mode);
    const download=page.locator('.a-comment-file').getByRole('button',{name:/^Download /});
    await download.focus();
    const tooltip=page.getByRole('tooltip',{name:'Download attachment',exact:true});
    await expect(tooltip).toBeVisible();
    const bounds=await tooltip.boundingBox();
    expect(bounds!.width).toBeGreaterThan(100);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.keyboard.press('Escape');await expect(tooltip).toBeHidden();
    await download.blur();
  }
});

test("comment dialogs escape the feed and do not scroll the workspace on open",async({page})=>{
  const panel=page.locator('.a-collaboration-panel');
  await panel.evaluate(el=>{(el as HTMLElement).style.transform='translateZ(0)';(el as HTMLElement).style.marginTop='600px';});
  for(const [action,title] of [['Report comment','Report comment'],['History','Comment history'],['Delete','Delete comment?']]) {
    const item=page.locator('.a-comment-item').first();
    await item.locator('summary').click();
    const button=page.getByRole('button',{name:action,exact:true});
    const before=await page.evaluate(()=>window.scrollY);
    await button.click();
    const dialog=page.getByRole('dialog',{name:title,exact:true});
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(el=>el.closest('.a-collaboration-panel'))).toBeNull();
    const box=await dialog.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y+box!.height).toBeLessThanOrEqual(page.viewportSize()!.height+1);
    expect(await page.evaluate(()=>window.scrollY)).toBe(before);
    expect(await page.locator('.a-dialog-scrim').evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  }
});

test("full-view replies stay in the bottom composer and preserve the editor across view changes", async ({page})=>{
  await page.evaluate(()=>{(window as any).setFull(true);(window as any).groupComments();});
  const editor=page.getByRole("textbox",{name:"Comment",exact:true});
  await editor.fill("Root draft");
  const target=page.locator("#comment-early");
  await target.getByRole("button",{name:"Reply",exact:true}).click();
  const bottom=page.locator(".a-comment-compose-dock > .a-comment-compose-placement");
  await expect(bottom.getByRole("textbox",{name:"Comment",exact:true})).toBeFocused();
  await expect(target.getByRole("textbox")).toHaveCount(0);
  await expect(editor).toHaveCount(1);
  await editor.fill("Reply draft survives moving");
  await editor.evaluate(el=>(window as any).originalEditor=el);
  await page.evaluate(()=>(window as any).setFull(false));
  await expect(page.locator(".a-comment-compose-dock > .a-comment-compose-placement").getByRole("textbox")).toContainText("Reply draft survives moving");
  await page.evaluate(()=>(window as any).setFull(true));
  expect(await editor.evaluate(el=>el===(window as any).originalEditor)).toBe(true);
  await expect(bottom.getByRole("textbox")).toContainText("Reply draft survives moving");
  await page.getByRole("button",{name:"Mentions",exact:true}).click();
  await expect(page.locator(".a-comment-compose-dock > .a-comment-compose-placement").getByRole("textbox")).toContainText("Reply draft survives moving");
  await page.getByRole("button",{name:"All",exact:true}).click();
  await expect(bottom.getByRole("textbox")).toContainText("Reply draft survives moving");
  await page.getByRole("button",{name:"Cancel reply",exact:true}).click();
  await expect(editor).toContainText("Root draft");
});

test("comment attachment eye opens the shared preview and close restores focus",async({page})=>{
  await page.evaluate(()=>(window as any).pinCommentFile());
  const preview=page.getByRole("button",{name:"Preview attachment proof.pdf",exact:true});
  await preview.click();
  await expect(page.getByText("Fixture preview unavailable")).toBeVisible();
  expect(await page.evaluate(()=>(window as any).commentCalls.filter((call:any)=>call.path.endsWith("/preview")).at(-1)?.body.rendition)).toBe("preview_default");
  await page.getByRole("button",{name:"Close preview",exact:true}).click();
  await expect(preview).toBeFocused();
});

test('notification deep link bounds automatic paging and allows manual continuation',async({page})=>{
 await page.route('https://comments.test/?**',route=>route.fulfill({contentType:'text/html',body:`<html><head><style>${css}</style></head><body><div id="root"></div></body></html>`}));
 await page.goto('https://comments.test/?commentId=page-7&threadRootId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 await page.evaluate(()=>{(window as any).eightPages=true;});
 await page.evaluate(bundle);
 await expect(page.getByText('The linked reply is not loaded. Use Load more replies to continue.')).toBeVisible();
 expect(await page.evaluate(()=>(window as any).commentCalls.filter((call:any)=>call.path==="thread-page").length)).toBeLessThanOrEqual(6);
 while (!await page.getByText('Reply page 8',{exact:true}).isVisible()) {
   await page.getByRole('button',{name:'Load more replies',exact:true}).click();
 }
 await expect(page.getByText('Reply page 8',{exact:true})).toBeVisible();
});

test("collapsed composer preserves a draft and returns to reading after sending",async({page})=>{
  const editor=page.getByRole('textbox',{name:'Comment',exact:true});
  await editor.fill('Keep this draft');
  await page.getByRole('button',{name:'Minimize composer',exact:true}).click();
  await expect(editor).toHaveCount(0);
  await page.getByRole('button',{name:'Resume draft',exact:true}).click();
  await expect(editor).toBeFocused();
  await expect(editor).toContainText('Keep this draft');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(page.getByRole('button',{name:'＋ Add comment',exact:true})).toBeVisible();
  await expect(editor).toHaveCount(0);
});


test("reply and edit drafts survive minimizing with distinct resume actions",async({page})=>{
 const item=page.locator('.a-comment-item').first();
 await item.getByRole('button',{name:'Reply',exact:true}).click();
 const reply=page.locator('.a-comment-compose-slot');
 await reply.getByRole('textbox',{name:'Comment',exact:true}).fill('Keep this reply');
 await reply.getByRole('button',{name:'Minimize composer',exact:true}).click();
 await page.getByRole('button',{name:'Resume reply',exact:true}).click();
 await expect(reply.getByRole('textbox',{name:'Comment',exact:true})).toContainText('Keep this reply');
 await expect(reply.getByRole('textbox',{name:'Comment',exact:true})).toBeFocused();
 await reply.getByRole('button',{name:'Cancel reply',exact:true}).click();
 await item.locator('summary').click();await item.getByRole('button',{name:'Edit',exact:true}).click();
 const edit=item.getByRole('region',{name:'Edit comment',exact:true});
 await edit.getByRole('textbox',{name:'Comment',exact:true}).fill('Keep this edit');
 await edit.getByRole('button',{name:'Minimize composer',exact:true}).click();
 await expect(edit.getByRole('textbox',{name:'Comment',exact:true})).toHaveCount(0);
 await edit.getByRole('button',{name:'Resume editing',exact:true}).click();
 await expect(edit.getByRole('textbox',{name:'Comment',exact:true})).toContainText('Keep this edit');
 await expect(edit.getByRole('textbox',{name:'Comment',exact:true})).toBeFocused();
 await edit.getByRole('button',{name:'Cancel editing',exact:true}).click();
 await expect(item).toContainText('Original comment');
});

test("editing and creation take turns without losing drafts on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.evaluate(() => (window as any).setFull(true));
  const creation = page.locator('.a-comment-compose-slot');
  await creation.getByRole('textbox', { name: 'Comment', exact: true }).fill('New comment draft');
  const item = page.locator('.a-comment-item').first();
  // Put the editable final comment below the fold, as in a long discussion.
  await item.evaluate(node => { node.style.marginTop = '1000px'; });
  await item.locator('summary').click();
  await item.getByRole('button', { name: 'Edit', exact: true }).click();
  const edit = item.getByRole('region', { name: 'Edit comment', exact: true });
  await expect(creation).toBeHidden();
  await expect(page.locator('.a-comment-compose-dock')).toHaveCSS('position', 'static');
  await edit.getByRole('textbox', { name: 'Comment', exact: true }).fill('Edited draft');
  await expect(edit.getByRole('button', { name: 'Save comment', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Resume draft', exact: true }).click();
  await expect(edit.getByRole('textbox')).toHaveCount(0);
  await expect(creation.getByRole('textbox')).toContainText('New comment draft');
  await edit.getByRole('button', { name: 'Resume editing', exact: true }).click();
  await expect(creation).toBeHidden();
  await expect(edit.getByRole('textbox')).toContainText('Edited draft');
  await expect(edit.getByRole('button', { name: 'Save comment', exact: true })).toBeInViewport();
  await edit.getByRole('button', { name: 'Cancel editing', exact: true }).click();
  await expect(page.locator('.a-comment-compose-dock')).toHaveCSS('position', 'sticky');
});

test("posting shows one actionable toast without an inline success row", async ({ page }) => {
  const item = page.locator('.a-comment-item').first();
  const id = (await item.getAttribute('id'))!.replace(/^comment-/, '');
  await page.evaluate(id => (window as any).postedCommentId = id, id);
  await page.getByRole('textbox', { name: 'Comment', exact: true }).fill('A new comment');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('.a-global-toast')).toHaveCount(1);
  await expect(page.locator('.a-comment-posted')).toHaveCount(0);
  await page.getByRole('button', { name: 'View comment', exact: true }).click();
  await expect(item).toBeFocused();
  await expect(page.locator('.a-global-toast')).toHaveCount(0);
});
