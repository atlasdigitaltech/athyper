import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { expect, test, type Page } from "@playwright/test";
import { planeStyles } from "./fixtures/app-styles";

// ChoiceSelect: the design-system select-only combobox that replaces native
// <select> (docs/architecture/application-experience/ui-system-standard.md §3).
const script = buildSync({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {ChoiceSelect,Dialog,DialogTrigger,DialogContent} from './packages/platform/foundation/ui/src/index';
const reasons=[{value:'spam',label:'Spam'},{value:'harassment',label:'Harassment'},{value:'misinformation',label:'Misinformation'},{value:'off_topic',label:'Off topic',disabled:true},{value:'other',label:'Other'}];
const periods=[{value:'today',label:'Today',group:'Days'},{value:'last:7',label:'Last 7 days',group:'Days'},{value:'this_week',label:'This week',group:'Weeks'},{value:'this_month',label:'This month',group:'Months'}];
function App(){
  const [reason,setReason]=useState('');const [period,setPeriod]=useState('last:7');const [submitted,setSubmitted]=useState('');
  return <main>
    <form onSubmit={e=>{e.preventDefault();setSubmitted(String(new FormData(e.currentTarget).get('reason')));}}>
      <label htmlFor="reason">Reason</label>
      <ChoiceSelect id="reason" name="reason" required value={reason} onChange={setReason} options={reasons}/>
      <button>Submit</button>
    </form>
    <output aria-label="Submitted">{submitted}</output>
    <ChoiceSelect label="Period" value={period} onChange={setPeriod} options={periods}/>
    <p aria-label="Period value">{period}</p>
    <Dialog><DialogTrigger>Open dialog</DialogTrigger><DialogContent title="Settings"><ChoiceSelect label="Dialog period" value={period} onChange={setPeriod} options={periods}/></DialogContent></Dialog>
  </main>;
}
createRoot(document.getElementById('root')).render(<App/>);`,
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  loader: { ".css": "empty" },
  tsconfig: resolve("tooling/config/tsconfig-react.json"),
  define: { "process.env.NODE_ENV": '"test"' },
  logLevel: "silent",
}).outputFiles[0]!.text;

async function mount(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 900, height: 700 });
  await page.setContent(
    `<!doctype html><html lang="en" data-theme="light" data-density="comfortable"><head><meta charset="utf-8"><style>${planeStyles("neon")}body{margin:0;padding:24px}</style></head><body><div id="root"></div></body></html>`,
  );
  await page.addScriptTag({ content: script });
  await expect(page.getByRole("combobox", { name: "Reason" })).toBeVisible();
  expect(errors).toEqual([]);
}

test("pointer use: placeholder, disabled options, choice, and form submission with native validation", async ({
  page,
}) => {
  await mount(page);
  const reason = page.getByRole("combobox", { name: "Reason" });
  await expect(reason).toHaveText("Select an option");
  await expect(reason).toHaveAttribute("aria-expanded", "false");
  // Required and empty: the form does not submit and focus returns to the control.
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByLabel("Submitted")).toHaveText("");
  await expect(reason).toBeFocused();
  await reason.click();
  const listbox = page.getByRole("listbox", { name: "Reason" });
  await expect(listbox).toBeVisible();
  await expect(reason).toHaveAttribute("aria-expanded", "true");
  await expect(listbox.getByRole("option")).toHaveText([
    "Spam",
    "Harassment",
    "Misinformation",
    "Off topic",
    "Other",
  ]);
  await expect(
    listbox.getByRole("option", { name: "Off topic" }),
  ).toHaveAttribute("aria-disabled", "true");
  // A disabled option ignores activation (dispatched: Playwright will not click aria-disabled).
  await listbox
    .getByRole("option", { name: "Off topic" })
    .dispatchEvent("click");
  await expect(listbox).toBeVisible();
  await listbox.getByRole("option", { name: "Harassment" }).click();
  await expect(listbox).toHaveCount(0);
  await expect(reason).toHaveText("Harassment");
  await expect(reason).toBeFocused();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByLabel("Submitted")).toHaveText("harassment");
  // Outside pointer closes without changing the value.
  await reason.click();
  await page.mouse.click(880, 680);
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(reason).toHaveText("Harassment");
});

test("keyboard: arrows skip disabled options, Home/End, Enter, Escape, Tab and type-ahead", async ({
  page,
}) => {
  await mount(page);
  const reason = page.getByRole("combobox", { name: "Reason" });
  await reason.focus();
  await page.keyboard.press("ArrowDown");
  const listbox = page.getByRole("listbox", { name: "Reason" });
  await expect(listbox).toBeVisible();
  const active = () =>
    reason.evaluate(
      (node) =>
        node.ownerDocument.getElementById(
          node.getAttribute("aria-activedescendant") ?? "",
        )?.textContent,
    );
  expect(await active()).toBe("Spam");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  expect(await active()).toBe("Misinformation");
  await page.keyboard.press("ArrowDown");
  expect(await active()).toBe("Other");
  await page.keyboard.press("Home");
  expect(await active()).toBe("Spam");
  await page.keyboard.press("End");
  await page.keyboard.press("Escape");
  await expect(listbox).toHaveCount(0);
  await expect(reason).toHaveText("Select an option");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(reason).toHaveText("Harassment");
  await expect(reason).toBeFocused();
  // Closed type-ahead changes the value directly and skips disabled options.
  await page.keyboard.press("o");
  await expect(reason).toHaveText("Other");
  await page.waitForTimeout(600); // the type-ahead buffer resets after 500ms
  await page.keyboard.press("m");
  await expect(reason).toHaveText("Misinformation");
  // Tab accepts the highlighted option and moves focus on.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Tab");
  await expect(reason).toHaveText("Harassment");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Submit" })).toBeFocused();
});

test("grouped options are labelled groups and the selected option is marked", async ({
  page,
}) => {
  await mount(page);
  const period = page.getByRole("combobox", { name: "Period" });
  await expect(period).toHaveText("Last 7 days");
  await period.click();
  const listbox = page.getByRole("listbox", { name: "Period" });
  for (const name of ["Days", "Weeks", "Months"])
    await expect(listbox.getByRole("group", { name })).toBeVisible();
  await expect(
    listbox.getByRole("group", { name: "Days" }).getByRole("option"),
  ).toHaveText(["Today", "Last 7 days"]);
  await expect(listbox.getByRole("option", { selected: true })).toHaveText(
    "Last 7 days",
  );
  const box = (await listbox.boundingBox())!,
    anchor = (await period.boundingBox())!;
  expect(Math.round(box.x)).toBe(Math.round(anchor.x));
  expect(Math.round(box.y)).toBe(Math.round(anchor.y + anchor.height + 4));
  await listbox.getByRole("option", { name: "This month" }).click();
  await expect(page.getByLabel("Period value")).toHaveText("this_month");
});

test("inside a dialog the list stays in the modal, on screen, and Escape closes only the list", async ({
  page,
}) => {
  await mount(page);
  await page.getByRole("button", { name: "Open dialog" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  const control = dialog.getByRole("combobox", { name: "Dialog period" });
  await control.click();
  const listbox = dialog.getByRole("listbox", { name: "Dialog period" });
  await expect(listbox).toBeVisible();
  const box = (await listbox.boundingBox())!,
    anchor = (await control.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(900);
  expect(
    Math.abs(box.y - (anchor.y + anchor.height + 4)) <= 1 ||
      Math.abs(box.y + box.height + 4 - anchor.y) <= 1,
  ).toBe(true);
  expect(box.width).toBeGreaterThanOrEqual(anchor.width - 1);
  await page.keyboard.press("Escape");
  await expect(listbox).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(control).toBeFocused();
});
