import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import * as React from "react";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import {
  DecisionDialog,
  UnsavedChangesDialog,
  useGuardedNavigation,
} from "../../packages/planes/neon/business-partner/src/case-experience";
import { ApplicationNavigationProvider } from "../../packages/platform/shell/app-foundation/src/index";

let dom: JSDOM;
let root: Root;
let host: HTMLElement;

beforeEach(() => {
  dom = new JSDOM(
    "<!doctype html><html><body><div id='root'></div></body></html>",
    { url: "https://neon.athyper.local", pretendToBeVisual: true },
  );
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    MouseEvent: { configurable: true, value: dom.window.MouseEvent },
    KeyboardEvent: { configurable: true, value: dom.window.KeyboardEvent },
    Event: { configurable: true, value: dom.window.Event },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  Object.defineProperties(dom.window.HTMLElement.prototype, {
    attachEvent: { configurable: true, value() {} },
    detachEvent: { configurable: true, value() {} },
  });
  host = document.querySelector("#root") as HTMLElement;
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
});

const click = async (element: Element) =>
  act(async () =>
    element.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );

describe("Business Partner case dialogs", () => {
  it("validates a decision reason, traps Escape, and restores trigger focus", async () => {
    const reasons: string[] = [];
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button
            type="button"
            id="approval-trigger"
            onClick={() => setOpen(true)}
          >
            Approve
          </button>
          <DecisionDialog
            decision="approve"
            open={open}
            busy={false}
            onOpenChange={setOpen}
            onConfirm={async (reason) => {
              reasons.push(reason);
            }}
          />
        </>
      );
    }
    await act(async () => root.render(<Harness />));
    const trigger = host.querySelector<HTMLButtonElement>("#approval-trigger")!;
    trigger.focus();
    await click(trigger);
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    assert.match(dialog.textContent ?? "", /Approve request/);
    const reason =
      dialog.querySelector<HTMLInputElement>("#bp-approve-reason")!;
    assert.equal(document.activeElement, reason);
    const confirmButton =
      dialog.querySelector<HTMLButtonElement>("button:last-child")!;
    confirmButton.focus();
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
      ),
    );
    assert.equal(document.activeElement, reason);
    await click(confirmButton);
    assert.match(
      dialog.querySelector('[role="alert"]')?.textContent ?? "",
      /reason is required/i,
    );
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(reason, "  Pinned evidence reviewed.  ");
      reason.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await click(dialog.querySelector<HTMLButtonElement>("button:last-child")!);
    assert.deepEqual(reasons, ["Pinned evidence reviewed."]);
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    assert.equal(host.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, trigger);
  });

  it("cancels or confirms guarded navigation without losing the pending target", async () => {
    const pushed: string[] = [];
    function Harness() {
      const navigation = useGuardedNavigation(true);
      return (
        <>
          <button
            type="button"
            id="leave"
            onClick={() =>
              navigation.navigate("/mdg/business-partner/requests")
            }
          >
            Leave
          </button>
          <UnsavedChangesDialog navigation={navigation} />
        </>
      );
    }
    await act(async () =>
      root.render(
        <ApplicationNavigationProvider
          navigation={{
            push: (href) => pushed.push(href),
            replace: () => undefined,
            refresh: () => undefined,
          }}
        >
          <Harness />
        </ApplicationNavigationProvider>,
      ),
    );
    const unload = new dom.window.Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    assert.equal(unload.defaultPrevented, true);
    await click(host.querySelector("#leave")!);
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
    assert.match(dialog.textContent ?? "", /Discard unsaved changes/);
    assert.deepEqual(pushed, []);
    await click(
      [...dialog.querySelectorAll("button")].find(
        (button) => button.textContent === "Cancel",
      )!,
    );
    assert.equal(host.querySelector('[role="dialog"]'), null);
    await click(host.querySelector("#leave")!);
    await click(
      [...host.querySelectorAll('[role="dialog"] button')].find(
        (button) => button.textContent === "Discard changes",
      )!,
    );
    assert.deepEqual(pushed, ["/mdg/business-partner/requests"]);
  });
});
