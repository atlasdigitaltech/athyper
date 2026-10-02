import type { AtlasContentBlock } from "@athyper/server-contract-ai";

/** Candidate receipts only: the repository must verify every durable invocation. */
export function directEntityReadResults(content: readonly AtlasContentBlock[]) {
  const results = content.filter((block) => block.type === "tool_result");
  const calls = content.filter((block) => block.type === "tool_use");
  if (!content.some((block) => block.type === "text" && block.text.trim()))
    return;
  if (
    results.length !== 1 &&
    !(
      results.length === 2 &&
      results[0]?.toolName === "entity_discover" &&
      ["entity_lookup", "entity_follow_reference"].includes(
        results[1]!.toolName,
      )
    )
  )
    return;
  if (
    calls.length !== results.length ||
    new Set(results.map((result) => result.callId)).size !== results.length
  )
    return;
  if (
    results.some(
      (result) =>
        result.isError ||
        !calls.some(
          (call) =>
            call.callId === result.callId && call.toolName === result.toolName,
        ),
    )
  )
    return;
  // Discovery alone provides no record evidence for a direct answer.
  if (results.every((result) => result.toolName === "entity_discover")) return;
  return results;
}
