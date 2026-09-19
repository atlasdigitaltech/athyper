import assert from "node:assert/strict";
import * as React from "react";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import {
  Checkbox,
  Dialog,
  DialogContent,
  DialogTrigger,
  Drawer,
  DrawerContent,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../packages/platform/foundation/ui/src/index";

let dom: JSDOM;
let root: Root;
let host: HTMLElement;

beforeEach(() => {
  dom = new JSDOM(
    "<!doctype html><html><body><div id='root'></div></body></html>",
    { url: "https://test.athyper.local", pretendToBeVisual: true },
  );
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    MouseEvent: { configurable: true, value: dom.window.MouseEvent },
    KeyboardEvent: { configurable: true, value: dom.window.KeyboardEvent },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
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
const pointerDown = async (element: Element) =>
  act(async () =>
    element.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })),
  );

describe("primitive interactions", () => {
  it("supports uncontrolled tabs and keyboard arrow selection", async () => {
    await act(async () =>
      root.render(
        <Tabs defaultValue="one">
          <TabsList>
            <TabsTrigger value="one">One</TabsTrigger>
            <TabsTrigger value="two">Two</TabsTrigger>
          </TabsList>
          <TabsContent value="one">First</TabsContent>
          <TabsContent value="two">Second</TabsContent>
        </Tabs>,
      ),
    );
    const tabs = host.querySelectorAll<HTMLElement>('[role="tab"]');
    await click(tabs[1]!);
    assert.equal(tabs[1]?.getAttribute("aria-selected"), "true");
    tabs[1]?.focus();
    await act(async () =>
      tabs[1]?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      ),
    );
    assert.equal(tabs[0]?.getAttribute("aria-selected"), "true");
    assert.equal(document.activeElement, tabs[0]);
  });

  it("reports controlled tab changes without mutating the supplied value", async () => {
    let requested = "";
    await act(async () =>
      root.render(
        <Tabs
          value="one"
          onValueChange={(value) => {
            requested = value;
          }}
        >
          <TabsList>
            <TabsTrigger value="one">One</TabsTrigger>
            <TabsTrigger value="two">Two</TabsTrigger>
          </TabsList>
        </Tabs>,
      ),
    );
    const tabs = host.querySelectorAll<HTMLElement>('[role="tab"]');
    await click(tabs[1]!);
    assert.equal(requested, "two");
    assert.equal(tabs[0]?.getAttribute("aria-selected"), "true");
  });

  it("supports uncontrolled menus and reports controlled open requests", async () => {
    await act(async () =>
      root.render(
        <Menu>
          <MenuTrigger>Actions</MenuTrigger>
          <MenuContent>
            <MenuItem>Archive</MenuItem>
          </MenuContent>
        </Menu>,
      ),
    );
    const trigger = host.querySelector<HTMLButtonElement>(
      '[aria-haspopup="menu"]',
    )!;
    await click(trigger);
    assert.ok(host.querySelector('[role="menu"]'));
    await click(host.querySelector('[role="menuitem"]')!);
    assert.equal(host.querySelector('[role="menu"]'), null);
    let requested = false;
    await act(async () =>
      root.render(
        <Menu
          open={false}
          onOpenChange={(open) => {
            requested = open;
          }}
        >
          <MenuTrigger>Controlled</MenuTrigger>
          <MenuContent>Items</MenuContent>
        </Menu>,
      ),
    );
    await click(host.querySelector('[aria-haspopup="menu"]')!);
    assert.equal(requested, true);
    assert.equal(host.querySelector('[role="menu"]'), null);
  });

  it("dismisses an open menu when the user interacts outside it", async () => {
    await act(async () =>
      root.render(
        <div>
          <Menu>
            <MenuTrigger>Actions</MenuTrigger>
            <MenuContent>
              <MenuItem>Archive</MenuItem>
            </MenuContent>
          </Menu>
          <button type="button" id="outside">
            Outside
          </button>
        </div>,
      ),
    );
    await click(host.querySelector('[aria-haspopup="menu"]')!);
    assert.ok(host.querySelector('[role="menu"]'));
    await pointerDown(host.querySelector("#outside")!);
    assert.equal(host.querySelector('[role="menu"]'), null);
  });

  it("keeps only one toolbar menu open and preserves composed trigger handlers", async () => {
    let triggerClicks = 0;
    await act(async () =>
      root.render(
        <div>
          <Menu>
            <MenuTrigger
              onClick={() => {
                triggerClicks += 1;
              }}
            >
              Row 1
            </MenuTrigger>
            <MenuContent>View options</MenuContent>
          </Menu>
          <Menu>
            <MenuTrigger>More</MenuTrigger>
            <MenuContent>More options</MenuContent>
          </Menu>
        </div>,
      ),
    );
    const triggers = host.querySelectorAll<HTMLButtonElement>(
      '[aria-haspopup="menu"]',
    );
    await click(triggers[0]!);
    assert.equal(triggerClicks, 1);
    assert.equal(
      host.querySelector('[role="menu"]')?.textContent,
      "View options",
    );
    await click(triggers[1]!);
    assert.equal(host.querySelectorAll('[role="menu"]').length, 1);
    assert.equal(
      host.querySelector('[role="menu"]')?.textContent,
      "More options",
    );
    assert.equal(triggers[0]?.getAttribute("aria-expanded"), "false");
  });

  it("uses native checkbox state and closes dialogs with Escape while restoring focus", async () => {
    await act(async () =>
      root.render(
        <>
          <Checkbox aria-label="Remember" />
          <Dialog>
            <DialogTrigger>Open</DialogTrigger>
            <DialogContent title="Review">
              <button type="button">Inside</button>
            </DialogContent>
          </Dialog>
        </>,
      ),
    );
    const checkbox = host.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    await click(checkbox);
    assert.equal(checkbox.checked, true);
    const trigger = host.querySelector<HTMLButtonElement>(
      '[aria-haspopup="dialog"]',
    )!;
    trigger.focus();
    await click(trigger);
    assert.equal(document.activeElement?.textContent, "Inside");
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    assert.equal(host.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, trigger);
  });

  it("preserves the active dialog control when controlled content rerenders", async () => {
    const renderDialog = (description: string) => (
      <Dialog open onOpenChange={() => undefined}>
        <DialogContent title="Filters" description={description}>
          <button id="field" type="button">
            Field
          </button>
          <button id="value" type="button">
            Value
          </button>
        </DialogContent>
      </Dialog>
    );
    await act(async () => root.render(renderDialog("Initial")));
    const value = host.querySelector<HTMLButtonElement>("#value")!;
    value.focus();
    await act(async () => root.render(renderDialog("Updated")));
    assert.equal(document.activeElement, value);
  });

  it("renders an accessible drawer and dismisses it from the scrim", async () => {
    await act(async () =>
      root.render(
        <Dialog defaultOpen>
          <DrawerContent title="Filters" description="Refine records">
            <button type="button">Apply</button>
          </DrawerContent>
        </Dialog>,
      ),
    );
    const drawer = document.body.querySelector<HTMLElement>(".a-drawer")!;
    assert.equal(drawer.getAttribute("role"), "dialog");
    assert.equal(drawer.getAttribute("aria-modal"), "true");
    assert.match(drawer.textContent ?? "", /Filters.*Refine records.*Apply/);
    await click(
      document.body.querySelector<HTMLButtonElement>(".a-dialog-scrim")!,
    );
    assert.equal(document.body.querySelector(".a-drawer"), null);
  });

  it("composes a tabbed framework drawer with fixed regions and lazy panels", async () => {
    await act(async () =>
      root.render(
        <Drawer.Root defaultOpen>
          <Drawer.Panel
            size="wide"
            variant="detail"
            mobilePresentation="bottom-sheet"
          >
            <Drawer.Header
              icon={<span>LI</span>}
              title="Line item 0010"
              description="Purchase order PO-1042"
            />
            <Drawer.Tabs defaultValue="overview">
              <Drawer.Navigation aria-label="Line item sections">
                <Drawer.TabList>
                  <Drawer.Tab value="overview">Overview</Drawer.Tab>
                  <Drawer.Tab value="history">History</Drawer.Tab>
                </Drawer.TabList>
              </Drawer.Navigation>
              <Drawer.Toolbar>Line actions</Drawer.Toolbar>
              <Drawer.Body>
                <Drawer.TabPanel value="overview">
                  Overview content
                </Drawer.TabPanel>
                <Drawer.TabPanel value="history" mount="lazy">
                  History content
                </Drawer.TabPanel>
              </Drawer.Body>
              <Drawer.Footer>
                <button type="button">Save item</button>
              </Drawer.Footer>
            </Drawer.Tabs>
          </Drawer.Panel>
        </Drawer.Root>,
      ),
    );
    const drawer = document.body.querySelector<HTMLElement>(
      ".a-drawer--framework",
    )!;
    assert.equal(drawer.dataset["size"], "wide");
    assert.equal(drawer.dataset["variant"], "detail");
    assert.equal(drawer.getAttribute("aria-modal"), "true");
    assert.match(
      drawer.textContent ?? "",
      /Line item 0010.*Purchase order PO-1042.*Overview content.*Save item/,
    );
    assert.doesNotMatch(drawer.textContent ?? "", /History content/);
    assert.equal(
      document.activeElement?.getAttribute("aria-label"),
      "Close panel",
    );
    const tabs = drawer.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs[0]?.focus();
    await act(async () =>
      tabs[0]?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      ),
    );
    assert.equal(tabs[1]?.getAttribute("aria-selected"), "true");
    assert.match(drawer.textContent ?? "", /History content/);
  });
});
