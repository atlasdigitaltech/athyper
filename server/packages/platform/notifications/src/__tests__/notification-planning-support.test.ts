import { describe, expect, it } from "vitest";
import { evaluatesCondition, recipientPrincipalIds, renderNotificationTemplate } from "../notification-planning-support.js";

const actor = "11111111-1111-4111-8111-111111111111";
const recipient = "22222222-2222-4222-8222-222222222222";

describe("notification planning support", () => {
  it("expands bounded, valid recipients from event data", () => {
    expect(recipientPrincipalIds({ actor: true, principal_paths: ["record.watchers"], principal_ids: ["not-a-uuid"] }, { tenantId: actor, actorPrincipalId: actor, id: "event-1", eventCode: "record.updated", planeKey: "neon", payload: { record: { watchers: [recipient, "bad"] } } })).toEqual([actor, recipient]);
  });

  it("evaluates composed conditions", () => {
    expect(evaluatesCondition({ all: [{ path: "record.status", eq: "active" }, { not: { path: "record.hidden", exists: true } }] }, { record: { status: "active" } })).toBe(true);
  });

  it("escapes HTML substitutions and preserves structured bodies", () => {
    expect(renderNotificationTemplate({ version: 1, subject: "Hello {{person.name}}", body_text: null, body_html: "<b>{{person.name}}</b>", body_json: { action: "{{record.id}}" }, variables_schema: { required: ["person.name"] } }, { person: { name: "A < B" }, record: { id: "r-1" } })).toMatchObject({ subject: "Hello A < B", renderedHtml: "<b>A &lt; B</b>", action: "r-1" });
  });
});
