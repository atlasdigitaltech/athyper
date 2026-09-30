import type { AtlasModelPrompt } from "./model.js";
/** Conservative UTF-8 byte bound for the pinned Qwen byte-BPE model, including
 * role/template delimiters and serialized tool definitions. Never use chars/4.
 * This intentionally admits less text than an exact tokenizer would. */
export function localPromptTokenBound(prompt: AtlasModelPrompt): number {
  const bytes = (v: unknown) =>
    new TextEncoder().encode(JSON.stringify(v)).byteLength;
  return (
    512 +
    prompt.messages.reduce((sum, m) => sum + 128 + bytes(m), 0) +
    (prompt.tools?.length ? bytes(prompt.tools) + 128 * prompt.tools.length : 0)
  );
}
export function fitLocalPrompt(
  prompt: AtlasModelPrompt,
  contextTokens = 4096,
): AtlasModelPrompt {
  if (
    !Number.isSafeInteger(prompt.maxOutputTokens) ||
    prompt.maxOutputTokens < 1 ||
    prompt.maxOutputTokens > 1024 ||
    contextTokens !== 4096
  )
    throw new RangeError("Invalid local context policy");
  const messages = [...prompt.messages];
  // Preserve system instructions and the current user turn. Evict complete older
  // user turns, including their assistant/tool messages, never individual blocks.
  while (
    localPromptTokenBound({ ...prompt, messages }) + prompt.maxOutputTokens >
    contextTokens
  ) {
    const users = messages.flatMap((m, i) => (m.role === "user" ? [i] : []));
    if (users.length < 2) throw new RangeError("Local context budget exceeded");
    messages.splice(users[0]!, users[1]! - users[0]!);
  }
  return { ...prompt, messages };
}
