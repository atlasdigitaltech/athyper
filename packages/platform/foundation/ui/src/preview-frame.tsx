"use client";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** A real CSS viewport, using the host theme and styles without loading an app route. */
export function PreviewFrame({
  title,
  width,
  children,
}: {
  title: string;
  width: number;
  children: ReactNode;
}) {
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!frame) return;
    const initialize = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      doc.head.replaceChildren();
      doc.title = title;
      doc.documentElement.lang = document.documentElement.lang || "en";
      for (const style of document.querySelectorAll(
        'style, link[rel="stylesheet"]',
      ))
        doc.head.append(style.cloneNode(true));
      doc.documentElement.className = document.documentElement.className;
      for (const attribute of document.documentElement.attributes) {
        if (attribute.name.startsWith("data-") || attribute.name === "style")
          doc.documentElement.setAttribute(attribute.name, attribute.value);
      }
      doc.body.className = document.body.className;
      doc.body.style.cssText =
        "margin:0;padding:24px;min-width:0;background:var(--a-background);color:var(--a-foreground)";
      setTarget(doc.body);
    };
    initialize();
    frame.addEventListener("load", initialize);
    return () => frame.removeEventListener("load", initialize);
  }, [frame, title]);
  return (
    <div
      className="a-preview-frame"
      role="region"
      aria-label={`${title} viewport`}
      tabIndex={0}
    >
      <iframe
        ref={setFrame}
        title={title}
        className="a-preview-frame__canvas"
        style={{ width }}
      />
      {target
        ? createPortal(
            <main aria-label={title}>
              <h1
                style={{
                  position: "absolute",
                  width: 1,
                  height: 1,
                  padding: 0,
                  margin: -1,
                  overflow: "hidden",
                  clipPath: "inset(50%)",
                  whiteSpace: "nowrap",
                }}
              >
                {title}
              </h1>
              {children}
            </main>,
            target,
          )
        : null}
    </div>
  );
}
