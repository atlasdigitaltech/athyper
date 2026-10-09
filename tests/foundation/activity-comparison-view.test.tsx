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

// Pins the snapshot comparison's rendered output. First pinned before the C1
// extraction (Entity list Compare blueprint section 11.4) and left unedited
// through it; updated deliberately for C1b (section 9.6), in its own commit,
// with the new output reviewed: the shared comparison table, the earlier
// snapshot as fixed baseline, relative wording, exact decimals formatted by
// kind, and captured references shown as "Linked record".

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
    { key: "country", label: "country", before: value("7f3c2e1d-4b5a-4c6d-8e9f-000000000001"), after: value("7f3c2e1d-4b5a-4c6d-8e9f-000000000002"), changed: true, reference: true },
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
    { key: "country", label: "Country", kind: "reference" },
  ],
  presentation: {
    sections: [
      { key: "general", label: "General", fields: ["name", "code", "status"] },
      { key: "terms", label: "Terms", fields: ["rate", "valid_from"] },
      { key: "geography", label: "Geography", fields: ["region", "country"] },
    ],
    navigation: { tabs: [{ key: "overview", label: "Overview", sectionKeys: ["general", "terms", "geography"] }] },
  },
} as unknown as ActivityPresentation;

/** A compact outline of the rendered tree: tag, class, open state and own text. */
function outline(element: Element, depth = 0): string {
  const own = [...element.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent!.trim()).filter(Boolean).join(" ");
  const attributes = [
    element.getAttribute("class") ? `.${element.getAttribute("class")!.split(" ").join(".")}` : "",

    element.getAttribute("data-outcome") ? `[outcome=${element.getAttribute("data-outcome")}]` : "",
    element.getAttribute("data-state") ? `[state=${element.getAttribute("data-state")}]` : "",
    element.hasAttribute("data-baseline") ? "[baseline]" : "",
    element.getAttribute("aria-expanded") ? `[expanded=${element.getAttribute("aria-expanded")}]` : "",
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
  [...root.querySelectorAll("tbody tr.a-comparison__row")].map((row) => [
    row.querySelector(".a-comparison__label")!.textContent,
    ...[...row.querySelectorAll("td")].map((cell) => cell.textContent),
    row.getAttribute("data-outcome"),
  ]);

test("renders differences against the earlier snapshot, with labels, choice labels, exact decimals, dates, empty, uncaptured and linked-record cells", async () => {
  await render(comparison.fields, async (root) => {
    assert.equal(root.querySelector("h3")?.textContent, "Snapshot comparison");
    const headers = [...root.querySelectorAll("thead th")].map((cell) => cell.textContent);
    assert.deepEqual(headers, ["Field", "Snapshot 1BaselineSep 28, 2026, 8:00 AMEarlier snapshot", "Snapshot 2Oct 2, 2026, 9:30 AMLater snapshot"]);
    const sections = [...root.querySelectorAll(".a-comparison__section-heading button")].map((button) => button.textContent);
    assert.deepEqual(sections, ["Overview · General2 differ", "Overview · Terms2 differ", "Overview · Geography1 differ1 not compared", "Additional fieldsnone differ"]);
    // Differences only (the default): differing rows, then "Not compared".
    assert.deepEqual(rows(root), [
      ["Name", "Old name", "New nameDiffers from the earlier snapshot", "differs"],
      ["Status", "Draft", "ActiveDiffers from the earlier snapshot", "differs"],
      ["Rate", "1.50", "12,345,678,901,234,567,890.1234Differs from the earlier snapshot", "differs"],
      ["Valid from", "Sep 28, 2026", "Empty · capturedDiffers from the earlier snapshot", "differs"],
      ["Country", "Linked record", "Linked recordDiffers from the earlier snapshot", "differs"],
      ["Region", "Not captured", "AsiaNot compared", "not_comparable"],
    ]);
    assert.match(root.querySelector(".a-activity-comparison__summary")!.textContent!, /^5 of 8 fields differ · 1 not compared$/);
    assert.ok(!root.innerHTML.includes("7f3c2e1d"), "a captured reference never shows its identifier");
    const vocabulary = [...root.querySelectorAll(".a-comparison__mark, .a-comparison__badge, .a-comparison__count, .a-activity-comparison__summary")].map((item) => item.textContent).join(" ");
    assert.ok(!/chang/i.test(vocabulary), "difference wording is relative, never 'changed'");
  });
});

test("pins the rendered outline, the differences toggle, collapse, and next difference", async () => {
  await render(comparison.fields, async (root) => {
    assert.equal(outline(root), EXPECTED_OUTLINE);
    const toggle = root.querySelector<HTMLInputElement>(".a-activity-comparison__tools input")!;
    await act(async () => toggle.click());
    assert.deepEqual(rows(root).map((row) => row[0]), ["Name", "Code", "Status", "Rate", "Valid from", "Region", "Country", "Legacy flag"]);
    const button = (text: string) => [...root.querySelectorAll("button")].find((item) => item.textContent === text)!;
    await act(async () => button("Next difference").click());
    assert.equal(root.ownerDocument.activeElement?.textContent?.startsWith("Name"), true);
    await act(async () => button("Collapse all").click());
    assert.equal(root.querySelectorAll("tbody tr.a-comparison__row").length, 0);
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
      button.a-button.a-button--secondary.a-button--medium "Close details"
    div.a-activity-comparison__tools
      label.a-activity-comparison__switch "Differences only"
        input[checked=true]
      span.a-activity-comparison__summary "5 of 8 fields differ · 1 not compared"
      div
        button.a-button.a-button--ghost.a-button--medium "Previous difference"
        button.a-button.a-button--ghost.a-button--medium "Next difference"
        button.a-button.a-button--ghost.a-button--medium "Expand all"
        button.a-button.a-button--ghost.a-button--medium "Collapse all"
    div.a-activity-comparison__table
      table.a-comparison
        caption.a-comparison__caption "Snapshot comparison"
        thead
          tr
            th.a-comparison__field-heading "Field"
            th.a-comparison__column[baseline]
              div.a-comparison__column-inner
                div.a-comparison__column-text
                  span.a-comparison__code "Snapshot 1"
                  span.a-comparison__baseline "Baseline"
                  span.a-comparison__title "Sep 28, 2026, 8:00 AM"
                  span.a-comparison__note "Earlier snapshot"
            th.a-comparison__column
              div.a-comparison__column-inner
                div.a-comparison__column-text
                  span.a-comparison__code "Snapshot 2"
                  span.a-comparison__title "Oct 2, 2026, 9:30 AM"
                  span.a-comparison__note "Later snapshot"
        tbody.a-comparison__section
          tr.a-comparison__section-heading
            th
              button[expanded=true]
                span.a-comparison__chevron
                span "Overview · General"
                span.a-comparison__count "2 differ"
          tr.a-comparison__row[outcome=differs]
            th
              span.a-comparison__label "Name"
              span.a-comparison__badge[outcome=differs] "Differs"
            td.a-comparison__cell[state=value][baseline]
              span.a-comparison__value "Old name"
            td.a-comparison__cell[state=value]
              span.a-comparison__value "New name"
              span.a-comparison__marks
                span.a-comparison__mark "Differs from the earlier snapshot"
          tr.a-comparison__row[outcome=differs]
            th
              span.a-comparison__label "Status"
              span.a-comparison__badge[outcome=differs] "Differs"
            td.a-comparison__cell[state=value][baseline]
              span.a-comparison__value "Draft"
            td.a-comparison__cell[state=value]
              span.a-comparison__value "Active"
              span.a-comparison__marks
                span.a-comparison__mark "Differs from the earlier snapshot"
        tbody.a-comparison__section
          tr.a-comparison__section-heading
            th
              button[expanded=true]
                span.a-comparison__chevron
                span "Overview · Terms"
                span.a-comparison__count "2 differ"
          tr.a-comparison__row[outcome=differs]
            th
              span.a-comparison__label "Rate"
              span.a-comparison__badge[outcome=differs] "Differs"
            td.a-comparison__cell[state=value][baseline]
              span.a-comparison__value "1.50"
            td.a-comparison__cell[state=value]
              span.a-comparison__value "12,345,678,901,234,567,890.1234"
              span.a-comparison__marks
                span.a-comparison__mark "Differs from the earlier snapshot"
          tr.a-comparison__row[outcome=differs]
            th
              span.a-comparison__label "Valid from"
              span.a-comparison__badge[outcome=differs] "Differs"
            td.a-comparison__cell[state=value][baseline]
              span.a-comparison__value "Sep 28, 2026"
            td.a-comparison__cell[state=empty]
              span.a-comparison__value "Empty · captured"
              span.a-comparison__marks
                span.a-comparison__mark "Differs from the earlier snapshot"
        tbody.a-comparison__section
          tr.a-comparison__section-heading
            th
              button[expanded=true]
                span.a-comparison__chevron
                span "Overview · Geography"
                span.a-comparison__count "1 differ"
                span.a-comparison__count "1 not compared"
          tr.a-comparison__row[outcome=differs]
            th
              span.a-comparison__label "Country"
              span.a-comparison__badge[outcome=differs] "Differs"
            td.a-comparison__cell[state=value][baseline]
              span.a-comparison__value "Linked record"
            td.a-comparison__cell[state=value]
              span.a-comparison__value "Linked record"
              span.a-comparison__marks
                span.a-comparison__mark "Differs from the earlier snapshot"
          tr.a-comparison__subheading
            th "Not compared"
          tr.a-comparison__row[outcome=not_comparable]
            th
              span.a-comparison__label "Region"
              span.a-comparison__badge[outcome=not_comparable] "Not compared"
            td.a-comparison__cell[state=unavailable][baseline]
              span.a-comparison__value "Not captured"
            td.a-comparison__cell[state=value]
              span.a-comparison__value "Asia"
              span.a-comparison__marks
                span.a-comparison__mark "Not compared"
        tbody.a-comparison__section
          tr.a-comparison__section-heading
            th
              button[expanded=true]
                span.a-comparison__chevron
                span "Additional fields"
                span.a-comparison__count "none differ"
          tr.a-comparison__empty
            td "No differences in this section."
    p.a-comparison__visually-hidden
    p.a-entity-activity__hint "Grouped using the current record layout. Saved copies do not establish who changed these values or whether the live record has changed."`;
