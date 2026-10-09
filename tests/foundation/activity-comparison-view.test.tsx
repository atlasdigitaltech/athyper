// Datetimes in the pinned output are formatted in the process zone.
process.env.TZ = "UTC";
import test from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import type { ActivityComparison as Comparison, ActivitySnapshotItem } from "../../packages/contracts/platform/entity-runtime/src/activity";
import { ActivityComparison } from "../../packages/platform/entity/runtime/form-detail/src/activity-comparison";
import type { ActivityPresentation } from "../../packages/platform/entity/runtime/form-detail/src/activity-comparison-model";

// Pins the snapshot comparison's rendered output before the shared comparison
// core is extracted (Entity list Compare blueprint, section 11.4). The C1
// extraction commits must leave these assertions unedited.

const snapshots: ActivitySnapshotItem[] = [
  { id: "snap-1", sequence: 1, capturedAt: "2026-09-28T08:00:00.000Z", capturedBy: "u", sourceRecordVersion: 1, coverage: "authorized_fields" },
  { id: "snap-2", sequence: 2, capturedAt: "2026-10-02T09:30:00.000Z", capturedBy: "u", sourceRecordVersion: 2, coverage: "authorized_fields" },
];
const value = (v: unknown) => ({ state: "value" as const, value: v });
const comparison: Comparison = {
  from: "snap-1",
  to: "snap-2",
  fields: [
    { key: "name", label: "name", before: value("Old name"), after: value("New name"), changed: true },
    { key: "code", label: "code", before: value("MY"), after: value("MY"), changed: false },
    { key: "status", label: "status", before: value("draft"), after: value("active"), changed: true },
    { key: "rate", label: "rate", before: value("1.50"), after: value("12345678901234567890.1234"), changed: true },
    { key: "valid_from", label: "valid_from", before: value("2026-09-28"), after: value(null), changed: true },
    { key: "region", label: "region", before: { state: "uncaptured" }, after: value("Asia"), changed: false },
    { key: "legacy", label: "legacy label", before: value(true), after: value(true), changed: false },
  ],
};
const metadata = {
  fields: [
    { key: "name", label: "Name", kind: "string" },
    { key: "code", label: "Code", kind: "string" },
    { key: "status", label: "Status", kind: "enum", options: [{ value: "draft", label: "Draft" }, { value: "active", label: "Active" }] },
    { key: "rate", label: "Rate", kind: "decimal" },
    { key: "valid_from", label: "Valid from", kind: "date" },
    { key: "region", label: "Region", kind: "string" },
  ],
  presentation: {
    sections: [
      { key: "general", label: "General", fields: ["name", "code", "status"] },
      { key: "terms", label: "Terms", fields: ["rate", "valid_from"] },
      { key: "geography", label: "Geography", fields: ["region"] },
    ],
    navigation: { tabs: [{ key: "overview", label: "Overview", sectionKeys: ["general", "terms", "geography"] }] },
  },
} as unknown as ActivityPresentation;

/** A compact outline of the rendered tree: tag, class, open state and own text. */
function outline(element: Element, depth = 0): string {
  const own = [...element.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent!.trim()).filter(Boolean).join(" ");
  const attributes = [
    element.getAttribute("class") ? `.${element.getAttribute("class")!.split(" ").join(".")}` : "",
    element.hasAttribute("open") ? "[open]" : "",
    element.getAttribute("data-changed") ? `[changed=${element.getAttribute("data-changed")}]` : "",
    element.getAttribute("data-limited") ? `[limited=${element.getAttribute("data-limited")}]` : "",
    element.tagName === "INPUT" ? `[checked=${(element as HTMLInputElement).checked}]` : "",
  ].join("");
  const line = `${"  ".repeat(depth)}${element.tagName.toLowerCase()}${attributes}${own ? ` "${own}"` : ""}`;
  return [line, ...[...element.children].filter((child) => child.tagName !== "svg").map((child) => outline(child, depth + 1))].join("\n");
}

async function render(fields: Comparison["fields"], run: (root: HTMLElement, document: Document) => Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>');
  // Workspace components compile as classic JSX under this runner, so React is a global here.
  const previous = ["window", "document", "IS_REACT_ACT_ENVIRONMENT", "React"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  Object.defineProperties(globalThis, { window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document }, IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true }, React: { configurable: true, value: React } });
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ActivityComparison comparison={{ ...comparison, fields }} metadata={metadata} fieldLabels={{ legacy: "Legacy flag" }} snapshots={snapshots} onClose={() => undefined} />));
    await run(container, dom.window.document);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  }
}

const rows = (root: HTMLElement) =>
  [...root.querySelectorAll(".a-activity-comparison__field")].map((row) => [
    row.querySelector("dt")!.textContent,
    ...[...row.querySelectorAll("dd")].map((cell) => cell.lastElementChild!.textContent),
    row.getAttribute("data-changed"),
  ]);

test("renders grouped differences with labels, choice labels, exact decimals, dates, empty and uncaptured cells", async () => {
  await render(comparison.fields, async (root) => {
    assert.equal(root.querySelector("h3")?.textContent, "Snapshot comparison");
    const sections = [...root.querySelectorAll("details > summary")].map((summary) => summary.textContent);
    assert.deepEqual(sections, ["OverviewGeneral2 changed fields", "OverviewTerms2 changed fields", "OverviewGeographySome values cannot be compared"]);
    // Differences only (the default): changed rows, then the limited section as a note.
    assert.deepEqual(rows(root), [
      ["Name", "Old name", "New name", "true"],
      ["Status", "Draft", "Active", "true"],
      ["Rate", "1.50", "12345678901234567890.1234", "true"],
      ["Valid from", "Sep 28, 2026", "Empty · captured", "true"],
      ["Region", "Not captured", "Asia", "false"],
    ]);
    assert.match(root.querySelector(".a-activity-comparison__counts")!.textContent!, /4 changed fields/);
  });
});

test("pins the rendered outline, and the differences toggle and collapse controls", async () => {
  await render(comparison.fields, async (root, document) => {
    const before = outline(root);
    assert.equal(before, EXPECTED_OUTLINE);
    const toggle = root.querySelector<HTMLInputElement>(".a-activity-comparison__tools input")!;
    await act(async () => toggle.click());
    assert.deepEqual(rows(root).map((row) => row[0]), ["Name", "Code", "Status", "Rate", "Valid from", "Region", "Legacy flag"]);
    const collapse = [...root.querySelectorAll("button")].find((button) => button.textContent === "Collapse all")!;
    await act(async () => collapse.click());
    assert.ok([...root.querySelectorAll("details")].every((details) => !(details as HTMLDetailsElement).open));
    assert.ok(document);
  });
});

test("states no differences, and that the comparison is incomplete when a cell was not captured", async () => {
  await render([comparison.fields[1]!, comparison.fields[5]!], async (root) => {
    const result = root.querySelector(".a-activity-comparison__result")!;
    assert.equal(result.getAttribute("data-limited"), "true");
    assert.match(result.textContent!, /No differences/i);
  });
});

const EXPECTED_OUTLINE = `div
  section.a-entity-activity__detail.a-activity-comparison
    header
      div
        h3 "Snapshot comparison"
        p "Snapshot 1 · Sep 28, 2026, 8:00 AM Snapshot 2 · Oct 2, 2026, 9:30 AM"
      button.a-button.a-button--secondary.a-button--medium "Close details"
    div.a-activity-comparison__counts
      span "4 changed fields"
      span "2 affected sections"
    div.a-activity-comparison__tools
      label "Changes only"
        input[checked=true]
      div
        button.a-button.a-button--ghost.a-button--medium "Expand all"
        button.a-button.a-button--ghost.a-button--medium "Collapse all"
    details.a-activity-comparison__section[open]
      summary
        span
          small "Overview"
          strong "General"
        span "2 changed fields"
      div.a-activity-comparison__fields
        div.a-activity-comparison__columns
          span "Field"
          span "Snapshot 1 · Sep 28, 2026, 8:00 AM"
          span "Snapshot 2 · Oct 2, 2026, 9:30 AM"
        dl
          div.a-activity-comparison__field[changed=true]
            dt "Name"
            dd
              span.a-activity-comparison__value-label "Snapshot 1 · Sep 28, 2026, 8:00 AM"
              span "Old name"
            dd
              span.a-activity-comparison__value-label "Snapshot 2 · Oct 2, 2026, 9:30 AM"
              span "New name"
          div.a-activity-comparison__field[changed=true]
            dt "Status"
            dd
              span.a-activity-comparison__value-label "Snapshot 1 · Sep 28, 2026, 8:00 AM"
              span "Draft"
            dd
              span.a-activity-comparison__value-label "Snapshot 2 · Oct 2, 2026, 9:30 AM"
              span "Active"
    details.a-activity-comparison__section[open]
      summary
        span
          small "Overview"
          strong "Terms"
        span "2 changed fields"
      div.a-activity-comparison__fields
        div.a-activity-comparison__columns
          span "Field"
          span "Snapshot 1 · Sep 28, 2026, 8:00 AM"
          span "Snapshot 2 · Oct 2, 2026, 9:30 AM"
        dl
          div.a-activity-comparison__field[changed=true]
            dt "Rate"
            dd
              span.a-activity-comparison__value-label "Snapshot 1 · Sep 28, 2026, 8:00 AM"
              span "1.50"
            dd
              span.a-activity-comparison__value-label "Snapshot 2 · Oct 2, 2026, 9:30 AM"
              span "12345678901234567890.1234"
          div.a-activity-comparison__field[changed=true]
            dt "Valid from"
            dd
              span.a-activity-comparison__value-label "Snapshot 1 · Sep 28, 2026, 8:00 AM"
              span "Sep 28, 2026"
            dd
              span.a-activity-comparison__value-label "Snapshot 2 · Oct 2, 2026, 9:30 AM"
              span "Empty · captured"
    div.a-activity-comparison__notes
      p "Comparison notes · not counted as changes"
      details.a-activity-comparison__section
        summary
          span
            small "Overview"
            strong "Geography"
          span "Some values cannot be compared"
        div.a-activity-comparison__fields
          div.a-activity-comparison__columns
            span "Field"
            span "Snapshot 1 · Sep 28, 2026, 8:00 AM"
            span "Snapshot 2 · Oct 2, 2026, 9:30 AM"
          dl
            div.a-activity-comparison__field[changed=false]
              dt "Region"
              dd
                span.a-activity-comparison__value-label "Snapshot 1 · Sep 28, 2026, 8:00 AM"
                span "Not captured"
              dd
                span.a-activity-comparison__value-label "Snapshot 2 · Oct 2, 2026, 9:30 AM"
                span "Asia"
    p.a-entity-activity__hint "Grouped using the current record layout. Saved copies do not establish who changed these values or whether the live record has changed."`;
