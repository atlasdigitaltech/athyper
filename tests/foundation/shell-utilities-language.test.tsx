import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import type { SupportedLocale } from "@athyper/platform-i18n";
import { UtilitiesMenu } from "../../packages/platform/shell/shell/src/shell-utilities-menu";

// The language choice offers only the plane's effective policy (policy:i18n
// checks the wiring; this checks the behaviour): exactly the enabled locales,
// read-only for one, a select above three, and the chosen code reported.

async function render(enabledLocales: readonly SupportedLocale[], run: (h: { body: HTMLElement; window: JSDOM["window"]; chosen: string[] }) => Promise<void> | void) {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://example.test/" });
  const names = ["window", "document", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT", "React"] as const;
  const saved = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperties(globalThis, { window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document }, MutationObserver: { configurable: true, value: dom.window.MutationObserver }, IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true }, React: { configurable: true, value: React } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const chosen: string[] = [];
  try {
    await act(async () => root.render(<UtilitiesMenu applicationName="Neon" currentLocale="en" localePolicy={{ enabledLocales }} onLocaleChange={async (locale) => { chosen.push(locale); }} />));
    await run({ body: dom.window.document.body, window: dom.window, chosen });
  } finally {
    await act(async () => root.unmount());
    names.forEach((name, index) => (saved[index] ? Object.defineProperty(globalThis, name, saved[index]!) : delete (globalThis as Record<string, unknown>)[name]));
    dom.window.close();
  }
}
// Assertions take strings or booleans, never a jsdom node: formatting one for a
// failure message blocks the process instead of reporting the failure.
const languageGroup = (body: HTMLElement) => body.querySelector<HTMLElement>('[role="group"][aria-label="Language"]');

test("two enabled locales: exactly those two, and a choice reports its code", async () => {
  await render(["en", "ar"], async ({ body, window, chosen }) => {
    const buttons = [...languageGroup(body)!.querySelectorAll<HTMLButtonElement>("button")];
    assert.deepEqual(buttons.map((button) => button.lang), ["en", "ar"]);
    assert.deepEqual(buttons.map((button) => button.getAttribute("aria-pressed")), ["true", "false"]);
    await act(async () => { buttons[1]!.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    assert.deepEqual(chosen, ["ar"]);
  });
});

test("choosing the current locale reports nothing", async () => {
  await render(["en", "ar"], async ({ body, window, chosen }) => {
    await act(async () => { languageGroup(body)!.querySelector("button")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    assert.deepEqual(chosen, []);
  });
});

test("one enabled locale is shown read-only, with no picker", async () => {
  await render(["ms"], ({ body }) => {
    assert.ok(!languageGroup(body), "no segmented language choice");
    const readonly = body.querySelector(".athyper-shell__utilities-readonly")!;
    assert.match(readonly.textContent!, /Bahasa Melayu/);
    assert.ok(!readonly.querySelector("button, select, [role=combobox]"), "no language picker");
  });
});

test("more than three enabled locales become a select of exactly those", async () => {
  await render(["en", "ar", "ms", "fr"], async ({ body, window, chosen }) => {
    assert.ok(!languageGroup(body), "no segmented language choice");
    const select = body.querySelector<HTMLElement>('[role="combobox"][aria-label="Language"]')!;
    await act(async () => { select.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    const options = [...body.querySelectorAll<HTMLElement>('[role="option"]')];
    assert.deepEqual(options.map((option) => option.dataset.value), ["en", "ar", "ms", "fr"]);
    await act(async () => { options[3]!.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    assert.deepEqual(chosen, ["fr"]);
  });
});
