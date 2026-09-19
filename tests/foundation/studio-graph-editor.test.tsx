import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { GraphEditorForm } from "../../apps/studio/app/(shell)/entity/graphs/graph-editor";
import { ApiTransportError } from "../../packages/platform/foundation/api-client/src/index";
import {
  changeSet,
  loaded,
} from "../../apps/studio/app/(shell)/entity/graphs/graph-model";
let dom: JSDOM, root: Root, host: HTMLElement;
beforeEach(() => {
  dom = new JSDOM("<div id='root'></div>", { url: "https://studio.test" });
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  host = document.querySelector("#root")!;
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
});
const draft = {
  id: "draft",
  entityCode: "business_partner",
  title: "Draft",
  revision: 4,
  status: "draft",
};
const button = (name: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent === name)!;
async function mount(request: (...args: any[]) => Promise<any>) {
  await act(async () =>
    root.render(<GraphEditorForm client={{ request } as any} />),
  );
  const select = host.querySelector("select")!;
  await act(async () => {
    select.value = "draft";
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  const input = host.querySelector("textarea")!;
  await act(async () => {
    input.value = '{"edited":true}';
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
test("a save conflict preserves edits and revision until explicit reload", async () => {
  const writes: any[] = [];
  await mount(async (op, input) => {
    if (op.method === "PUT") {
      writes.push(input.body);
      throw new ApiTransportError("conflict", "Changed", 409);
    }
    return input?.params
      ? { changeSet: draft, graph: { original: true } }
      : [draft];
  });
  await act(async () => button("Save draft").click());
  assert.equal(writes[0].expectedRevision, 4);
  assert.equal(writes[0].edited, true);
  assert.equal(host.querySelector("textarea")!.value, '{"edited":true}');
  assert.match(host.textContent!, /Saved revision 4/);
  assert.equal(button("Save draft").disabled, true);
  await act(async () => button("Discard edits and reload latest").click());
  assert.equal(button("Save draft").disabled, false);
  assert.deepEqual(JSON.parse(host.querySelector("textarea")!.value), {
    original: true,
  });
});
test("successful save adopts the returned revision even if the follow-up read fails", async () => {
  let saved = false;
  await mount(async (op, input) => {
    if (op.method === "PUT") {
      saved = true;
      return { ...draft, revision: 5 };
    }
    if (input?.params) {
      if (saved) throw Error("Read unavailable");
      return { changeSet: draft, graph: { original: true } };
    }
    return [draft];
  });
  await act(async () => button("Save draft").click());
  assert.match(host.textContent!, /Saved revision 5/);
  assert.match(host.textContent!, /Read unavailable/);
  assert.equal(host.querySelector("textarea")!.value, '{"edited":true}');
});
test("graph parsers reject malformed revision, title and preview data", () => {
  assert.throws(() => changeSet({ ...draft, revision: NaN }));
  assert.throws(() => changeSet({ ...draft, title: null }));
  assert.throws(() =>
    loaded({
      changeSet: draft,
      graph: {},
      preview: { state: "ready", changeSetId: "draft", savedRevision: "4" },
    }),
  );
});

test("accepts the native change-set API's title-free contract", () => {
  const {title: _title, ...native} = draft;
  assert.equal(changeSet(native).title, "business_partner");
});
