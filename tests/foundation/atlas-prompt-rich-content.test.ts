import assert from "node:assert/strict";
import test from "node:test";
import { convertClipboard, serializeForClipboard } from "@athyper/platform-communications-collaboration-ui";
import { JSDOM } from "jsdom";

test("Atlas rich prompts preserve supported formatting and remove unsafe HTML", () => {
  const window = new JSDOM("").window;
  const previousNode = globalThis.Node;
  Object.defineProperty(globalThis, "Node", { configurable: true, value: window.Node });
  try {
    const conversion = convertClipboard({
      getData: (type) => type === "text/html"
        ? '<p>Review <strong>supplier</strong></p><ul><li>Address</li><li>Tax</li></ul><script>alert(1)</script><a href="javascript:alert(2)">unsafe</a>'
        : "",
    }, { domParser: new window.DOMParser() });
    assert.ok(conversion);
    const serialized = serializeForClipboard(conversion.document);
    assert.match(serialized["text/html"] ?? "", /<strong>supplier<\/strong>/);
    assert.match(serialized["text/html"] ?? "", /<ul>/);
    assert.doesNotMatch(serialized["text/html"] ?? "", /script|javascript:/i);
    assert.match(serialized["text/plain"] ?? "", /Address/);
  } finally {
    Object.defineProperty(globalThis, "Node", { configurable: true, value: previousNode });
    window.close();
  }
});
