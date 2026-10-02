import test from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import type { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import {
  FilterChoiceLoader,
  FilterValueEditor,
} from "../../packages/platform/entity/runtime/list-view/src/filter-editor";
import { SearchableFieldSelect } from "../../packages/platform/entity/runtime/list-view/src/field-catalogue";

async function renderTest(
  run: (
    root: ReturnType<typeof createRoot>,
    container: HTMLElement,
    dom: JSDOM,
  ) => Promise<void>,
) {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://neon.test" });
  const names = [
    "window",
    "document",
    "HTMLElement",
    "HTMLInputElement",
    "MouseEvent",
    "KeyboardEvent",
    "IS_REACT_ACT_ENVIRONMENT",
  ];
  const previous = names.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  for (const key of names)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value:
        key === "IS_REACT_ACT_ENVIRONMENT" ? true : (dom.window as any)[key],
    });
  const container = dom.window.document.querySelector<HTMLElement>("#root")!;
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(container);
  try {
    await run(root, container, dom);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of previous)
      descriptor
        ? Object.defineProperty(globalThis, key, descriptor)
        : delete (globalThis as any)[key];
    dom.window.close();
  }
}

test("boolean membership retains Yes/No after an empty choice response and never loads a dynamic catalogue", () =>
  renderTest(async (root, container) => {
    let loads = 0;
    const field = {
      key: "active",
      label: "Active",
      valueKind: "boolean",
    } as any;
    const render = (filterOptions?: readonly unknown[]) => (
      <FilterChoiceLoader.Provider
        value={async () => {
          loads++;
        }}
      >
        <FilterValueEditor
          field={{ ...field, filterOptions }}
          operator="in"
          value=""
          filterNumber={1}
          onChange={() => {}}
        />
      </FilterChoiceLoader.Provider>
    );
    await act(async () => root.render(render()));
    await act(async () => root.render(render([])));
    // A two-value set is shown inline as choice chips.
    const choices = [...container.querySelectorAll("button")].map((button) => button.textContent?.trim());
    assert.ok(choices.includes("Yes"));
    assert.ok(choices.includes("No"));
    assert.equal(loads, 0);
  }));

test("compact field select displays a stale field until explicitly replaced", () =>
  renderTest(async (root, container, dom) => {
    let selected: string | undefined;
    const fields = [{ key: "name", label: "Name", valueKind: "text" }] as any;
    await act(async () =>
      root.render(
        <SearchableFieldSelect
          fields={fields}
          value="retired"
          label="Field"
          onChange={(field) => {
            selected = field.key;
          }}
        />,
      ),
    );
    const input = container.querySelector<HTMLInputElement>("[role=combobox]")!;
    assert.equal(input.value, "Unavailable field: retired");
    assert.equal(selected, undefined);
    await act(async () => input.click());
    const name = [...dom.window.document.querySelectorAll<HTMLElement>("[role=option]")].find(
      (option) => option.textContent?.startsWith("Name"),
    )!;
    assert.ok(name);
    await act(async () => name.click());
    assert.equal(selected, "name");
  }));
