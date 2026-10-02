"use client";
import * as React from "react";
import { CloseIcon, PaperclipIcon } from "@athyper/platform-icons";

/** Presentation only: editor state, validation and submission belong to the caller. */
export interface ComposerFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly editorSize?: "compact" | "tall";
  readonly header?: React.ReactNode;
  readonly supportingContent?: React.ReactNode;
  readonly footer?: React.ReactNode;
}
export function ComposerFrame({editorSize = "compact", header, supportingContent, footer, children, className, ...props}: ComposerFrameProps) {
  return <div {...props} data-editor-size={editorSize} className={["a-composer-frame", className].filter(Boolean).join(" ")}>
    {header}{children}{supportingContent}{footer}
  </div>;
}
export function ComposerHeader({className, ...props}: React.HTMLAttributes<HTMLElement>) {
  return <header {...props} className={["a-composer-frame__header",className].filter(Boolean).join(" ")} />;
}
export function ComposerFooter({className, ...props}: React.HTMLAttributes<HTMLElement>) {
  return <footer {...props} className={["a-composer-frame__footer",className].filter(Boolean).join(" ")} />;
}

/** Files attached to a composer (comments, Atlas): one list and one chip, so
 * names, sizes, preparation status and Remove read the same everywhere. */
export function ComposerAttachments({ label, className, ...props }: React.HTMLAttributes<HTMLUListElement> & { readonly label: string }) {
  return <ul {...props} aria-label={label} className={["a-composer-attachments", className].filter(Boolean).join(" ")} />;
}
export function ComposerAttachment({
  name,
  detail,
  status = "ready",
  removeLabel,
  onRemove,
  disabled = false,
}: {
  readonly name: React.ReactNode;
  /** Size and preparation state, e.g. "96.5 KB · Ready to use". */
  readonly detail?: React.ReactNode;
  readonly status?: "uploading" | "processing" | "ready" | "error";
  readonly removeLabel: string;
  readonly onRemove?: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <li className="a-composer-attachment" data-status={status}>
      <PaperclipIcon size={16} aria-hidden="true" />
      <span>
        <strong>{name}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {onRemove ? (
        <button type="button" aria-label={removeLabel} title={removeLabel} disabled={disabled} onClick={onRemove}>
          <CloseIcon size={14} aria-hidden="true" />
        </button>
      ) : null}
    </li>
  );
}
