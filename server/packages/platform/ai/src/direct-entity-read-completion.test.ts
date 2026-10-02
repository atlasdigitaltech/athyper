import { expect, it } from "vitest";
import type { AtlasContentBlock } from "@athyper/server-contract-ai";
import { directEntityReadResults as receipts } from "./direct-entity-read-completion.js";
const call = (toolName: string, callId = toolName): AtlasContentBlock[] => [
  { type: "tool_use", toolName, callId, input: {} },
  { type: "tool_result", toolName, callId, result: {} },
];
const text: AtlasContentBlock = { type: "text", text: "Authorized answer" };
it("accepts discovery plus a read for durable receipt verification", () => {
  expect(
    receipts([
      ...call("entity_discover"),
      ...call("entity_follow_reference"),
      text,
    ]),
  ).toHaveLength(2);
  expect(receipts([...call("entity_read_section"), text])).toHaveLength(1);
});
it("rejects discovery alone, extra calls, duplicate calls and errors", () => {
  expect(receipts([...call("entity_discover"), text])).toBeUndefined();
  expect(
    receipts([
      ...call("entity_discover"),
      ...call("entity_follow_reference"),
      ...call("entity_lookup"),
      text,
    ]),
  ).toBeUndefined();
  expect(
    receipts([
      ...call("entity_discover", "same"),
      ...call("entity_follow_reference", "same"),
      text,
    ]),
  ).toBeUndefined();
  expect(
    receipts([
      ...call("entity_read_section").map((b) =>
        b.type === "tool_result" ? { ...b, isError: true } : b,
      ),
      text,
    ]),
  ).toBeUndefined();
});
it("rejects unmatched results and missing answer", () => {
  expect(receipts([call("entity_read_section")[1]!, text])).toBeUndefined();
  expect(receipts(call("entity_read_section"))).toBeUndefined();
});
