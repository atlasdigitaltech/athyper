import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import type { ActivityAuditItem } from "../../packages/contracts/platform/entity-runtime/src/activity";
import { ActivityEvents } from "../../packages/platform/entity/runtime/form-detail/src/activity-events";
import { activityActorLabel } from "../../packages/platform/entity/runtime/form-detail/src/activity-actor";
import { CollaborationPresentationContext } from "../../packages/platform/entity/runtime/form-detail/src/collaboration-visibility";

// The activity surfaces never display the acting principal's identifier
// (AGENTS.md no-UUID rule; Compare blueprint 9.6 follow-up).

const principal = "7f3c2e1d-4b5a-4c6d-8e9f-000000000042";
const items: ActivityAuditItem[] = [
  { id: "a1", occurredAt: "2026-10-02T09:30:00.000Z", event: "record.updated", operation: "patch", outcome: "success", actor: principal, changedFields: ["name"] },
  { id: "a2", occurredAt: "2026-10-02T10:30:00.000Z", event: "record.recomputed", operation: "patch", outcome: "success", actor: null, changedFields: [] },
];

test("a recorded principal reads 'Name not available'; no principal reads as the system", () => {
  const intl = { message: (key: string) => key };
  assert.equal(activityActorLabel(principal, intl), "activity.actorNameUnavailable");
  assert.equal(activityActorLabel(null, intl), "activity.system");
});

test("the event list and its table never render the actor identifier", async () => {
  for (const mode of ["content", "pinned"] as const) {
    const dom = new JSDOM('<div id="root"></div>');
    const names = ["window", "document", "IS_REACT_ACT_ENVIRONMENT", "React"] as const;
    const saved = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperties(globalThis, { window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document }, IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true }, React: { configurable: true, value: React } });
    const root = createRoot(dom.window.document.getElementById("root")!);
    try {
      await act(async () => root.render(<CollaborationPresentationContext.Provider value={mode}><ActivityEvents items={items} timeline={false} fieldLabels={{}} /></CollaborationPresentationContext.Provider>));
      const html = dom.window.document.getElementById("root")!.innerHTML;
      assert.ok(html.length > 0);
      assert.ok(!html.includes("7f3c2e1d"), `${mode}: no principal identifier`);
      assert.match(dom.window.document.body.textContent!, /Name not available/);
      assert.match(dom.window.document.body.textContent!, /System/);
    } finally {
      await act(async () => root.unmount());
      names.forEach((name, index) => (saved[index] ? Object.defineProperty(globalThis, name, saved[index]!) : delete (globalThis as Record<string, unknown>)[name]));
      dom.window.close();
    }
  }
});
