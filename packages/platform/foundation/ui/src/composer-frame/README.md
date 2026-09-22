# ComposerFrame

Shared presentation for prompt, comment, and future code editors. Exported from
`@athyper/platform-ui`. Load `@athyper/platform-ui/styles.css` once in the application.

```tsx
<ComposerFrame
  aria-label="JSON editor"
  header={<ComposerHeader><strong>Configuration</strong></ComposerHeader>}
  supportingContent={<p role="status">{validationMessage}</p>}
  footer={<ComposerFooter>
    <label>Language <select value={language} onChange={changeLanguage}>…</select></label>
    <button type="button" onClick={save}>Save</button>
  </ComposerFooter>}
>
  <CodeEditor value={value} onChange={setValue} />
</ComposerFrame>
```

The frame renders its header, children, supporting content, and footer in that order.
`ComposerHeader` and `ComposerFooter` may also be composed directly as children.
Pass ordinary DOM attributes and event handlers to each component. Label each editor
and its controls independently; a visible frame title does not label the textbox.

Consumers own editor state, keyboard shortcuts, validation, attachments, permissions,
loading states, and submission. The frame has no editor dependency, form submission,
network calls, or implicit Enter behavior. Keep a code editor behind its own adapter
and load it only when needed.

Use header actions for content helpers such as a prompt library; keep visibility next
to submission; put language selection in the code editor footer. Use explicit action
labels (Send, Save, Run). Allow controls to wrap without hiding access settings.

Sizing: `editorSize="compact"` (default) uses a 52px minimum and 200px maximum.
`editorSize="tall"` uses 200px and 400px. Add `data-composer-editor=""` to the
editor element to opt into sizing. Contenteditable editors grow with content and
scroll at the maximum; other editor adapters must manage their own content sizing.
The CSS variables `--composer-editor-min-height` and `--composer-editor-max-height`
allow a consumer to override these bounds without changing frame styles.
