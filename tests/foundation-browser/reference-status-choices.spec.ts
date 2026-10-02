import { build } from "esbuild";
import { expect, test } from "@playwright/test";
const script = build({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{FilterValueEditor}from'./packages/platform/entity/runtime/collection-controls/src/filter-editor';
import{formatFieldValue}from'./packages/platform/entity/runtime/list-view/src/field-format';
import{resolveRecordHeader,parseEntityRecordPresentation}from'./packages/contracts/platform/entity-runtime/src/record-presentation';
import{EntityRecordHeader}from'./packages/platform/entity/runtime/form-detail/src/record-header';
const field={key:'status',label:'Status',valueKind:'enum',semanticRole:'status',filterOperators:['eq','ne','in'],filterOptions:[{value:'active',label:'Active'},{value:'deprecated',label:'Deprecated'}]};
const presentation=parseEntityRecordPresentation({schemaVersion:1,titleField:'name',badges:[{field:'status',tones:{active:'success',deprecated:'warning'}}]});
function App(){const[value,setValue]=useState(sessionStorage.getItem('status-filter')||'active');const change=v=>{sessionStorage.setItem('status-filter',v);setValue(v)};const header=resolveRecordHeader(presentation,{name:'Afghanistan',status:'active'},{entityLabel:'Country',fallbackTitle:'Country',choiceLabels:{status:{active:'Active',deprecated:'Deprecated'}}});return <><EntityRecordHeader header={header} showNavigation={false}/><div data-testid="list-value">{formatFieldValue('active',field)}</div><FilterValueEditor field={field} filterNumber={1} operator="eq" value={value} onChange={change}/><output>{value}</output></>};createRoot(document.getElementById('root')).render(<App/>);
`,
  },
  bundle: true,
  loader: { ".css": "empty" },
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
});
test("enum filter displays labels, submits codes, restores selection and shares header labels", async ({
  page,
}) => {
  await page.route("http://reference.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
  );
  const mount = async () => {
    await page.goto("http://reference.test/");
    await page.addScriptTag({ content: (await script).outputFiles[0]!.text });
  };
  await mount();
  await expect(page.getByTestId("list-value")).toHaveText("Active");
  await expect(
    page.getByRole("heading", { name: "Afghanistan" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("banner", { name: "Afghanistan" })
      .getByText("Active", { exact: true }),
  ).toHaveText("Active");
  const select = page.getByRole("combobox", {
    name: "Value for Status filter 1",
  });
  await select.click();
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.getByRole("option", { name: /^Deprecated/ }).click();
  await expect(page.locator("output")).toHaveText("deprecated");
  await expect(select).toHaveValue("Deprecated");
  await mount();
  await expect(
    page.getByRole("combobox", { name: "Value for Status filter 1" }),
  ).toHaveValue("Deprecated");
  await expect(page.locator("output")).toHaveText("deprecated");
});
