import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { test, expect } from "@playwright/test";
import { withBusinessPartnerFullProfile } from "../../server/db/scripts/provisioning/business-partner-full-profile";
import { compileEntityIntakeSurfaces } from "../../packages/contracts/platform/entity-runtime/src/intake-surface-authoring";
const graph = withBusinessPartnerFullProfile({
  entity: { entityCode: "business_partner" },
  fields: [],
  surfaces: [
    {
      id: "details",
      surfaceKey: "intake_details",
      surfaceKind: "form",
      title: "Request",
      layoutKind: "flow",
      layoutConfig: {
        renderer: "intake",
        columns: 1,
        formLabels: { continue: "Continue", submit: "Submit" },
      },
      status: "active",
    },
  ],
  surfaceSections: [
    {
      id: "scope",
      entitySurfaceId: "details",
      sectionKey: "scope",
      position: 0,
      columnCount: 12,
    },
  ],
  surfaceFieldBindings: [],
} as any);
const surfaces = structuredClone(compileEntityIntakeSurfaces(graph));
const root = surfaces.find((s) => s.key === "intake_details")!;
(root as any).sections = root.sections.filter((s) =>
  s.fields.some(
    (f) => f.control === "repeatableGroup" && f.valueKey === "bankAccounts",
  ),
);
for (const f of surfaces.flatMap((s) => s.sections.flatMap((s) => s.fields))) {
  if (f.control !== "input" || !f.lookup?.sourceKey) continue;
  const options: Record<string, any[]> = {
    "iso.country": [
      { value: "MY", label: "Malaysia" },
      { value: "SG", label: "Singapore" },
    ],
    "iso.currency": [{ value: "MYR", label: "Malaysian ringgit" }],
    "control.bank_account_type": [
      {
        value: "local_account",
        label: "Local account",
        data: { countries: ["MY", "SG"] },
      },
      { value: "iban", label: "IBAN", data: { countries: ["DE"] } },
    ],
    "shared.bank_institution": [
      {
        value: "bank-a",
        label: "Example MY bank",
        data: {
          countryCode: "MY",
          name: "Example MY bank",
          bic: "MBBEMYKL",
          releaseId: "release-a",
        },
      },
      {
        value: "bank-b",
        label: "Example SG bank",
        data: {
          countryCode: "SG",
          name: "Example SG bank",
          bic: "DBSSSGSG",
          releaseId: "release-a",
        },
      },
    ],
    "shared.bank_branch": [
      {
        value: "branch-a",
        label: "Example branch",
        data: {
          countryCode: "MY",
          institutionId: "bank-a",
          branch: "Example branch",
        },
      },
    ],
  };
  (f.lookup as any).options = options[f.lookup.sourceKey] ?? [];
}
const styles = [
  "packages/platform/foundation/theme/src/styles.css",
  "packages/platform/foundation/ui/src/styles.css",
  "packages/platform/shell/shell/src/styles.css",
]
  .map((p) => readFileSync(p, "utf8").replace(/@import[^;]+;/g, ""))
  .join("\n");
const script = buildSync({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{EntityDataSurface,dataSurfaceDefaults}from'./packages/platform/entity/runtime/form-detail/src/data-surface';import{DataValidationProvider}from'./packages/platform/entity/runtime/form-detail/src/data-validation';const surfaces=${JSON.stringify(surfaces)};function App(){const root=surfaces.find(s=>s.key==='intake_details');const[answers,setAnswers]=useState(dataSurfaceDefaults(root,surfaces));return <EntityDataSurface surface={root} surfaces={surfaces} answers={answers} onChange={setAnswers} handlers={{'business_partner.account_holder':({field,value,onChange,id})=><><label htmlFor={id}>{field.label}</label><input id={id} value={value} onChange={e=>onChange(e.target.value)}/><button type="button" onClick={()=>onChange('Registered Example')}>{field.placeholder}</button></>,'business_partner.attachment':()=>null}}/>}createRoot(document.getElementById('root')).render(<DataValidationProvider><App/></DataValidationProvider>);`,
  },
  loader: { ".css": "empty" },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"test"' },
  tsconfig: resolve("tooling/config/tsconfig-react.json"),
  logLevel: "silent",
}).outputFiles[0]!.text;
async function mount(page: any) {
  await page.route("https://bank.test/**", (r: any) =>
    r.fulfill({ contentType: "text/html", body: "<!doctype html>" }),
  );
  await page.goto("https://bank.test/");
  await page.setContent(
    `<style>${styles}body{margin:0;padding:20px}*{box-sizing:border-box}</style><div id="root"></div>`,
  );
  await page.addScriptTag({ content: script });
  await page
    .getByRole("button", { name: "Add bank account", exact: true })
    .click();
}
async function choose(page: any, label: string, query: string, option: string) {
  const control = page.getByRole("combobox", { name: label, exact: true });
  await control.fill(query);
  await page.getByRole("option", { name: new RegExp(option) }).click();
}
test("directory choices cascade, prefill, and confirm changes while preserving the account", async ({
  page,
}) => {
  await mount(page);
  await choose(page, "Bank country", "Malaysia", "Malaysia");
  await choose(page, "Bank", "Example MY", "Example MY bank");
  await expect(page.getByLabel("SWIFT / BIC")).toHaveValue("MBBEMYKL");
  await choose(page, "Branch", "Example", "Example branch");
  await choose(page, "Account identifier type", "Local", "Local account");
  await page.getByLabel("Account number").fill("1234567890");
  await page.getByRole("button", { name: "Use registered name" }).click();
  await expect(page.getByLabel("Account holder name")).toHaveValue(
    "Registered Example",
  );
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await expect(page.getByLabel("Account number")).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "Hide", exact: true }).click();
  await choose(page, "Bank country", "Singapore", "Singapore");
  await expect(page.getByRole("alert")).toContainText(
    "Your account number and account holder remain unchanged",
  );
  await page.getByRole("button", { name: "Keep current" }).click();
  await expect(page.getByLabel("SWIFT / BIC")).toHaveValue("MBBEMYKL");
  await choose(page, "Bank country", "Singapore", "Singapore");
  await page.getByRole("button", { name: "Confirm change" }).click();
  await expect(page.getByLabel("IBAN / Account number")).toHaveValue(
    "1234567890",
  );
  await expect(page.getByLabel("Account holder name")).toHaveValue(
    "Registered Example",
  );
  await expect(page.getByLabel("SWIFT / BIC")).toHaveValue("");
  await choose(page, "Bank", "Example SG", "Example SG bank");
  await expect(page.getByLabel("SWIFT / BIC")).toHaveValue("DBSSSGSG");
});
test("unlisted banks have explicit manual fields and BIC validation, with mobile layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page);
  await page.getByLabel("Bank selection").selectOption("unlisted");
  await expect(page.getByLabel("Bank name")).toBeVisible();
  await page.getByLabel("Bank name").fill("Unlisted example");
  await page.getByLabel("SWIFT / BIC").fill("MBBYEXX");
  await page.getByLabel("Branch", { exact: true }).click();
  await expect(page.getByLabel("SWIFT / BIC")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByLabel("SWIFT / BIC").fill("MBBEMYKL");
  await page.getByLabel("Branch", { exact: true }).click();
  await expect(page.getByLabel("SWIFT / BIC")).not.toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("authored subsection headers and document count toolbar share the accent style", async ({
  page,
}) => {
  await mount(page);
  for (const title of ["Bank details", "Account details"]) {
    const header = page.getByRole("heading", { name: title, exact: true });
    await expect(header).toHaveClass(/a-subsection-header/);
    await expect(header.locator("svg")).toHaveCount(1);
  }
  const documents = page.locator(
    '.a-collection[data-presentation="documents"]',
  );
  await expect(
    documents.getByRole("heading", {
      name: "Supporting documents (0)",
      exact: true,
    }),
  ).toBeVisible();
  await expect(documents.locator(":scope > .a-subsection-header")).toHaveCount(
    1,
  );
  await documents
    .getByRole("button", { name: "Add document", exact: true })
    .click();
  await expect(
    documents.getByRole("heading", {
      name: "Supporting documents (1)",
      exact: true,
    }),
  ).toBeVisible();
  await documents.getByRole("button", { name: "Done", exact: true }).click();
  await expect(documents.locator(":scope > details")).toHaveAttribute("open");
});

test("removal dialog identifies the bank, traps focus, cancels and removes with its documents", async ({
  page,
}) => {
  await mount(page);
  await page.getByLabel("Bank selection").selectOption("unlisted");
  await page.getByLabel("Bank name").fill("Example bank");
  await page.getByLabel("IBAN / Account number").fill("123456789012");
  await page.getByRole("button", { name: "Add document", exact: true }).click();
  const remove = page.getByRole("button", {
    name: "Remove bank account",
    exact: true,
  });
  await remove.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toHaveAccessibleName("Remove Example bank · •••• 9012?");
  await expect(dialog).not.toContainText("123456789012");
  await expect(dialog).toContainText("supporting document entries (1)");
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Remove bank account", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(remove).toBeFocused();
  await remove.click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(remove).toBeFocused();
  await remove.click();
  await dialog
    .getByRole("button", { name: "Remove bank account", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Bank accounts (0)", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add bank account", exact: true }),
  ).toBeFocused();
});
