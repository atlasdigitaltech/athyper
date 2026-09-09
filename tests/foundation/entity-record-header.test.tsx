import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import {
  useRecordPage,
} from "../../packages/platform/shell/shell/src/entity-page-layout";
import { ManagementWorkspace } from "../../packages/platform/shell/shell/src/management-workspace";
import { EntityRecordHeader } from "../../packages/platform/entity/runtime/form-detail/src/record-header";
import {
  parseEntityRecordPresentation,
  readableRecordPresentation,
  resolveRecordHeader,
  validateRecordPresentationReferences,
  type EntityRecordHeaderV1,
} from "../../packages/contracts/platform/entity-runtime/src/record-presentation";

let dom: JSDOM, root: Root, host: HTMLElement;
beforeEach(() => {
  dom = new JSDOM("<div id='root'></div>", {
    url: "https://neon.athyper.test/mdg/partners/1",
  });
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  host = document.getElementById("root")!;
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
});
const presentation = parseEntityRecordPresentation({
  schemaVersion: 1,
  titleField: "name",
  codeField: "code",
  iconKey: "contact",
  badges: [{ field: "status", tones: { active: "success" } }],
  contextFields: ["company"],
  sections: [
    { key: "overview", label: "Overview", fields: ["name"] },
    { key: "activity", label: "Activity", placement: "overflow" },
  ],
  actions: [
    { key: "edit", label: "Edit", operationKey: "patch", placement: "primary" },
  ],
});
const header = resolveRecordHeader(
  presentation,
  { name: "Northwind", code: "BP-001", status: "active", company: "UK" },
  {
    entityLabel: "Business Partner",
    fallbackTitle: "Partner",
    actions: [
      { key: "edit", label: "Edit", placement: "primary", href: "/edit" },
      {
        key: "scope",
        label: "Configure company",
        placement: "overflow",
        href: "/scope",
      },
    ],
  },
);
function Record({ header }: { header: EntityRecordHeaderV1 }) {
  useRecordPage();
  return <EntityRecordHeader header={header} />;
}

describe("Shared metadata record header", () => {
  it("replaces collection chrome and restores it when leaving a record", async () => {
    const page = (record: boolean) => (
      <ManagementWorkspace
        header={<h1>Business Partners</h1>}
        navigation={<nav>Manage</nav>}
      >
        {record ? <Record header={header} /> : <div>Collection</div>}
      </ManagementWorkspace>
    );
    await act(async () => root.render(page(true)));
    assert.equal(host.querySelectorAll("h1").length, 1);
    assert.equal(host.querySelector("h1")?.textContent, "Northwind");
    assert.ok(!host.textContent?.includes("Manage"));
    await act(async () => root.render(page(false)));
    assert.equal(host.querySelector("h1")?.textContent, "Business Partners");
    assert.ok(host.textContent?.includes("Manage"));
  });
  it("uses the same renderer for documents and navigates overflow sections", async () => {
    let selected = "";
    const documentHeader = resolveRecordHeader(
      { ...presentation, titleField: "document_number" },
      { document_number: "INV-2026-001", status: "active" },
      { entityLabel: "Invoice", fallbackTitle: "Invoice" },
    );
    await act(async () =>
      root.render(
        <EntityRecordHeader
          header={documentHeader}
          activeSection="overview"
          onSelectSection={(value) => {
            selected = value;
          }}
        />,
      ),
    );
    assert.equal(host.querySelector("h1")?.textContent, "INV-2026-001");
    const activity = [...host.querySelectorAll("button")].find(
      (item) => item.textContent === "Activity",
    )!;
    await act(async () => activity.click());
    assert.equal(selected, "activity");
    assert.equal(activity.closest("details")?.open, false);
  });
  it("suppresses all actions in historical views", async () => {
    await act(async () =>
      root.render(
        <EntityRecordHeader header={{ ...header, readOnly: true }} />,
      ),
    );
    assert.equal(
      host.querySelectorAll('a[href="/edit"],a[href="/scope"]').length,
      0,
    );
    assert.ok(host.textContent?.includes("Historical read-only view"));
  });
  it("rejects unknown bindings and removes unreadable header fields and unpermitted actions", () => {
    assert.throws(
      () =>
        validateRecordPresentationReferences(presentation, ["name"], ["patch"]),
      /Unknown record presentation field/,
    );
    const safe = readableRecordPresentation(presentation, ["name"], [], "name");
    const resolved = resolveRecordHeader(
      safe,
      { name: "Visible", code: "SECRET", status: "active", company: "SECRET" },
      { entityLabel: "Master", fallbackTitle: "Master" },
    );
    assert.equal(resolved.code, undefined);
    assert.deepEqual(resolved.badges, []);
    assert.deepEqual(resolved.context, []);
    assert.deepEqual(safe.actions, []);
    assert.throws(
      () =>
        parseEntityRecordPresentation({
          ...presentation,
          actions: [
            ...presentation.actions,
            {
              key: "approve",
              label: "Approve",
              operationKey: "approve",
              placement: "primary",
            },
          ],
        }),
      /Only one primary/,
    );
  });
});
