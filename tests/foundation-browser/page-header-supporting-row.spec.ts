import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { expect, test } from "@playwright/test";

const styles = [
  "packages/platform/foundation/theme/src/styles.css",
  "packages/platform/shell/shell/src/styles.css",
]
  .map((path) => readFileSync(path, "utf8").replace(/@import[^;]+;/g, ""))
  .join("\n");
const bundle = buildSync({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
import React from "react";
import { createRoot } from "react-dom/client";
import { PageHeader } from "./packages/platform/shell/shell/src/page-foundation";
import { EntityTaskHeaderProvider, useEntityTaskHeader } from "./packages/platform/shell/shell/src/task-header";
import { EntityIntake } from "./packages/platform/entity/runtime/form-detail/src/intake";
const flow = {schemaVersion:1,key:"generic_create",kind:"create",title:"New business partner request",navigation:"linear",allowDraftResume:true,entryOperation:"create",completionOperation:"submit",steps:[{key:"partner",surfaceKey:"partner",title:"Partner",description:"Choose the role from the published intake flow.",optional:false}]};
function ApplicationHeader() {
  const header = useEntityTaskHeader();
  return <PageHeader level="collection" title={header?.title ?? "Business partners"} description={header?.description} supportingRow={header?.supportingRow} actions={header?.actions} />;
}
function App() {
  return <>
    <EntityTaskHeaderProvider><ApplicationHeader /><EntityIntake flow={flow} descriptorHash="generic-create-v1" runtime={{receipt:{code:"BPR-1042",version:3,statusLabel:"Saved"},policyPreview:{outcome:"reapproval-required",message:"Changes require reapproval"},operations:{exit:{operationKey:"exit",authorized:true,href:"/business-partners"}}}} cancelHref="/business-partners"><p>Form</p></EntityIntake></EntityTaskHeaderProvider>
    <PageHeader level="collection" title="Existing business partner" description="BP-001 · Business Partner" />
  </>;
}
createRoot(document.getElementById("root")).render(<App />);
`,
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  loader: { ".css": "text" },
  define: { "process.env.NODE_ENV": '"test"' },
  tsconfig: resolve("tooling/config/tsconfig-react.json"),
  logLevel: "silent",
}).outputFiles[0]!.text;

test("a generic intake uses server receipt and policy state as the shared second header row", async ({
  page,
}) => {
  await page.setContent(
    `<style>${styles}body{margin:0;padding:32px}*{box-sizing:border-box}</style><div id="root"></div>`,
  );
  await page.addScriptTag({ content: bundle });

  const task = page.locator(".athyper-page-header").first();
  const title = task.getByRole("heading");
  const taskStatus = task.locator(".athyper-page-header__supporting-row");
  const recordDescription = page
    .locator(".athyper-page-header")
    .nth(1)
    .locator(".athyper-page-header__description");

  await expect(taskStatus).toContainText("BPR-1042");
  await expect(taskStatus).toContainText("Saved");
  await expect(taskStatus).toContainText("v3");
  await expect(taskStatus).toContainText("Changes require reapproval");
  await expect(taskStatus).toHaveCSS("grid-row-start", "2");
  expect((await taskStatus.boundingBox())!.y).toBeGreaterThan(
    (await title.boundingBox())!.y,
  );
  await expect(task.locator(".athyper-page-header__description")).toHaveCount(0);
  await expect(recordDescription).toHaveCSS("grid-row-start", "2");
});
