import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { ExperienceComposerEditor } from "../../apps/studio/app/(shell)/entity/experiences/experience-composer";

let dom: JSDOM, root: Root, host: HTMLElement;
beforeEach(() => {
  dom = new JSDOM("<div id='root'></div>", {
    url: "https://studio.dev.athyper.test",
  });
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  host = document.querySelector("#root")!;
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
});
const definition = {
  schema: "athyper-experience-surface/1",
  id: "neon.home",
  revision: 1,
  scope: { kind: "home", plane: "neon" },
  title: "Home",
  blocks: [{ id: "welcome", type: "text", text: "Welcome" }],
};
const draft = {
  id: "release-1",
  revision: 1,
  status: "draft",
  targetPlane: "neon",
  contentHash: "a".repeat(64),
  definition,
};
const button = (text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent === text,
  )!;
const click = async (text: string) => {
  await act(async () => button(text).click());
};

test("editing a loaded draft preserves its concurrency hash and requires saving before publishing", async () => {
  const requests: any[] = [];
  const client = {
    request: async (operation: any, input: any) => {
      requests.push({ operation, input });
      return operation.method === "GET"
        ? { releases: [draft] }
        : { ...draft, definition: input.body.definition };
    },
  } as any;
  await act(async () =>
    root.render(
      <ExperienceComposerEditor
        client={client}
        initialDefinition={definition}
      />,
    ),
  );
  await click("Text");
  assert.equal(button("Publish").disabled, true);
  await click("Save draft");
  assert.equal(
    requests.at(-1).input.body.expectedContentHash,
    draft.contentHash,
  );
  assert.equal(requests.at(-1).input.body.definition.blocks.length, 2);
  assert.equal(button("Publish").disabled, false);
});

test("edits made while history loads keep the loaded draft's concurrency hash", async () => {
  let resolveHistory!: (value: unknown) => void;
  let body: any;
  const client = {
    request: async (operation: any, input: any) => {
      if (operation.method === "GET")
        return new Promise((resolve) => {
          resolveHistory = resolve;
        });
      body = input.body;
      return { ...draft, definition: body.definition };
    },
  } as any;
  await act(async () =>
    root.render(
      <ExperienceComposerEditor
        client={client}
        initialDefinition={definition}
      />,
    ),
  );
  await click("Text");
  assert.equal(button("Save draft").disabled, true);
  await act(async () => resolveHistory({ releases: [draft] }));
  await click("Save draft");
  assert.equal(body.expectedContentHash, draft.contentHash);
  assert.equal(body.definition.blocks.length, 2);
});

test("rollback disables editing and concurrent mutations until its response settles", async () => {
  let resolveRollback!: (value: unknown) => void;
  const client = {
    request: async (operation: any) =>
      operation.method === "GET"
        ? { releases: [{ ...draft, status: "published" }] }
        : new Promise((resolve) => {
            resolveRollback = resolve;
          }),
  } as any;
  await act(async () =>
    root.render(
      <ExperienceComposerEditor
        client={client}
        initialDefinition={definition}
      />,
    ),
  );
  await click("Restore to draft");
  assert.equal(host.querySelector("fieldset")!.disabled, true);
  const original = host.querySelector("textarea")!.value;
  await click("Text");
  assert.equal(host.querySelector("textarea")!.value, original);
  await act(async () => resolveRollback({ ...draft, id: "restored-draft" }));
  assert.equal(host.querySelector("fieldset")!.disabled, false);
});

test("failed history loads cannot silently turn into overwriting saves", async () => {
  const client = {
    request: async () => {
      throw new Error("History unavailable");
    },
  } as any;
  await act(async () =>
    root.render(
      <ExperienceComposerEditor
        client={client}
        initialDefinition={definition}
      />,
    ),
  );
  assert.equal(button("Save draft").disabled, true);
  assert.ok(button("Retry loading history"));
});

test("Atlas editor blocks edits during loading and requires recovery after a failed read", async () => {
  const { AtlasExperienceEditorForm } =
    await import("../../apps/studio/app/(shell)/mdg/business-partner/ai-experience/experience-editor");
  let rejectDraft!: (reason: Error) => void;
  let attempts = 0;
  const client = {
    draft: async () => {
      attempts++;
      if (attempts === 1)
        return new Promise((_resolve, reject) => {
          rejectDraft = reject;
        });
      return null;
    },
  } as any;
  await act(async () =>
    root.render(<AtlasExperienceEditorForm client={client} />),
  );
  assert.equal(button("Save draft").disabled, true);
  assert.equal(host.querySelector("fieldset")!.disabled, true);
  await act(async () => rejectDraft(new Error("Unavailable")));
  assert.equal(button("Publish configuration").disabled, true);
  await click("Retry loading draft");
  assert.equal(button("Save draft").disabled, false);
  assert.equal(host.querySelector("fieldset")!.disabled, false);
});
