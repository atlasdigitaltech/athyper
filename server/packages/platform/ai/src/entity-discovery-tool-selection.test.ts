import { expect, it } from "vitest";
import { entityDiscoveryRoundTools } from "./entity-discovery-tool-selection.js";
const tools = [
  "entity_discover",
  "entity_lookup",
  "entity_follow_reference",
  "unrelated",
].map((name) => ({ name, description: name, inputSchema: {} }));
it("stages discovery before data reads and ignores discovery from earlier conversation turns", () => {
  const discovery = {
    role: "tool" as const,
    content: [
      {
        type: "tool_result" as const,
        callId: "d",
        toolName: "entity_discover",
        result: { items: [{ entityCode: "example" }] },
      },
    ],
  };
  const user = {
    role: "user" as const,
    content: [{ type: "text" as const, text: "question" }],
  };
  expect(
    entityDiscoveryRoundTools(tools, "question", undefined, [user]).map(
      (t) => t.name,
    ),
  ).toEqual(["entity_discover"]);
  expect(
    entityDiscoveryRoundTools(tools, "question", undefined, [
      user,
      discovery,
    ]).map((t) => t.name),
  ).toEqual(["entity_lookup", "entity_follow_reference"]);
  expect(
    entityDiscoveryRoundTools(tools, "question", undefined, [
      user,
      discovery,
      user,
    ]).map((t) => t.name),
  ).toEqual(["entity_discover"]);
});
