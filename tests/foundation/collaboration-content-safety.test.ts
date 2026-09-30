import assert from "node:assert/strict";
import test from "node:test";
import { projectRichText } from "../../server/packages/platform/collaboration/src/rich-text";
import {
  hasRichTextContent,
  richTextPlain,
} from "../../packages/platform/communications/collaboration-ui/src/rich-text-content";
import { parseClipboardDocument } from "../../packages/platform/communications/collaboration-ui/src/validate-clipboard-document";
import { serializeForClipboard } from "../../packages/platform/communications/collaboration-ui/src/clipboard-converter";
import type { RichTextDocument } from "../../packages/platform/communications/collaboration-ui/src/rich-text-types";
const doc = (content: RichTextDocument["content"]): RichTextDocument => ({
  type: "doc",
  schema: "athyper.rich-text/1.0",
  content,
});
test("mention-only and uploading documents are not empty drafts", () => {
  const mention = doc([
    {
      type: "paragraph",
      content: [
        {
          type: "mention",
          attrs: {
            principalId: "11111111-1111-4111-8111-111111111111",
            label: "Ada",
          },
        },
      ],
    },
  ]);
  assert.equal(hasRichTextContent(mention), true);
  assert.equal(richTextPlain(mention), "@Ada");
  assert.equal(hasRichTextContent(doc([{ type: "pendingImage" }])), true);
  assert.equal(
    hasRichTextContent(
      doc([{ type: "paragraph", content: [{ type: "text", text: "  " }] }]),
    ),
    false,
  );
  assert.deepEqual(parseClipboardDocument(JSON.stringify(mention)), mention);
});
test("clipboard links are checked before insertion and again when serialized", () => {
  for (const href of [
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "vbscript:msgbox(1)",
  ]) {
    const value = doc([
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "link",
            marks: [{ type: "link", attrs: { href } }],
          },
        ],
      },
    ]);
    assert.throws(
      () => parseClipboardDocument(JSON.stringify(value)),
      /Invalid/,
    );
    assert.equal(
      serializeForClipboard(value)["text/html"].includes("<a "),
      false,
    );
  }
});
test("clipboard shape and recursion limits reject malformed custom MIME", () => {
  assert.throws(() =>
    parseClipboardDocument(JSON.stringify(doc([null as never]))),
  );
  assert.throws(() =>
    parseClipboardDocument(
      JSON.stringify(doc([{ type: "text", text: "invalid root" }])),
    ),
  );
  const value = doc([
    { type: "paragraph", content: [{ type: "text", text: "x".repeat(50001) }] },
  ]);
  assert.throws(() => parseClipboardDocument(JSON.stringify(value)));
});
test("plain projection preserves paragraph and table boundaries", () => {
  const value = doc([
    { type: "paragraph", content: [{ type: "text", text: "one" }] },
    { type: "paragraph", content: [{ type: "text", text: "two" }] },
  ]);
  assert.equal(richTextPlain(value), "one\ntwo");
  assert.equal(serializeForClipboard(value)["text/plain"], "one\ntwo");
  assert.equal(projectRichText(value as unknown as Record<string, unknown>).text, richTextPlain(value));
});
