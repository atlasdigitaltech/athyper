# Collaboration clipboard pipeline

`convertPasteEvent` converts browser clipboard input into the
`athyper.rich-text/1.0` document shape. Input precedence is Athyper's internal
JSON MIME type, HTML, TSV/plain text, then image files.

```ts
const conversion = convertPasteEvent(event);
if (!conversion) return;

const document = await uploadClipboardImages(conversion, {
  upload: async (file) => {
    // Call services/attachments: reserve quota, stage, upload, scan/finalize.
    const attachment = await attachments.upload(file);
    return { attachmentId: attachment.id };
  },
});

editor.insert(document.content);
```

`pendingImage` is a browser-only node and must never be sent to the
collaboration API. `uploadClipboardImages` replaces every pending node with an
`attachmentImage` containing a durable UUID, and fails when any upload is
unresolved.

Use `serializeForClipboard` for copy operations. It emits internal JSON,
sanitized semantic HTML, and plain text (tables become TSV). The HTML contains
application attachment routes rather than presigned object-storage URLs.

`RichCommentComposer` connects these pieces and emits a submit-ready
`rich_json` command. Its default attachment adapter uses:

1. `POST /api/attachments/stage`
2. `PUT` to the returned presigned upload URL
3. `POST /api/attachments/:id/finalize`

The platform host must compose these routes over `services/attachments`; the
browser never receives or constructs an object-storage key.
