"use client";
import * as React from "react";

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
