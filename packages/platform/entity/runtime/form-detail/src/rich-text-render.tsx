"use client";
import {
  safeHref,
  richTextPlain,
  visitRichText,
  isAttachmentNode,
} from "@athyper/platform-communications-collaboration-ui";
import { type RichTextDocument } from "@athyper/platform-communications-collaboration-ui";
import { Fragment, type ReactNode } from "react";

import { valueRecord, display } from "./section-primitives";

export function editableCommentDocument(
  item: Readonly<Record<string, unknown>>,
): RichTextDocument {
  const document =
    draftDocument(item) ??
    ({
      type: "doc",
      schema: "athyper.rich-text/1.0",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: String(item.text ?? "") }],
        },
      ],
    } as RichTextDocument);
  const ids = new Set<string>();
  visitRichText(document, (node) => {
    if (isAttachmentNode(node) && typeof node.attrs?.attachmentId === "string")
      ids.add(node.attrs.attachmentId);
  });
  const missing = Array.isArray(item.pinnedFiles)
    ? item.pinnedFiles
        .filter((file: any) => !ids.has(file.attachmentId))
        .map((file: any) => ({
          type: "attachmentFile",
          attrs: {
            attachmentId: String(file.attachmentId),
            alt: String(file.fileName ?? "File"),
          },
        }))
    : [];
  return { ...document, content: [...document.content, ...missing] };
}
export function draftDocument(
  value?: Readonly<Record<string, unknown>>,
): RichTextDocument | undefined {
  const content = value?.content;
  return content &&
    typeof content === "object" &&
    !Array.isArray(content) &&
    (content as { type?: unknown }).type === "doc"
    ? (content as RichTextDocument)
    : undefined;
}
export function richText(document: RichTextDocument): string {
  return richTextPlain(document).trim();
}
export function renderComment(
  item: Readonly<Record<string, unknown>>,
): ReactNode {
  const content = item.content;
  if (!content || typeof content !== "object" || Array.isArray(content))
    return <p>{display(item.text)}</p>;
  const visit = (node: any): ReactNode => {
    if (node.type === "text")
      return applyCommentMarks(node.text ?? "", node.marks);
    if (node.type === "hardBreak") return <br />;
    if (node.type === "mention")
      return <span>@{node.attrs?.label ?? "mention"}</span>;
    if (node.type === "attachmentImage" || node.type === "attachmentFile")
      return Array.isArray(item.pinnedFiles) &&
        item.pinnedFiles.some(
          (file: any) => file.attachmentId === node.attrs?.attachmentId,
        ) ? null : (
        <span>[Attachment: {node.attrs?.alt ?? "file"}]</span>
      );
    const children = Array.isArray(node.content)
      ? node.content.map((child: any, index: number) => (
          <Fragment key={index}>{visit(child)}</Fragment>
        ))
      : null;
    if (node.type === "paragraph") return <p>{children}</p>;
    if (node.type === "heading") {
      const Heading = (
        [1, 2, 3, 4, 5, 6].includes(Number(node.attrs?.level))
          ? `h${Number(node.attrs.level)}`
          : "h3"
      ) as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return <Heading>{children}</Heading>;
    }
    if (node.type === "bulletList") return <ul>{children}</ul>;
    if (node.type === "orderedList") return <ol>{children}</ol>;
    if (node.type === "listItem") return <li>{children}</li>;
    if (node.type === "blockquote") return <blockquote>{children}</blockquote>;
    if (node.type === "table")
      return (
        <div className="a-comment-rich-table-wrap">
          <table className="a-comment-rich-table">
            <tbody>{children}</tbody>
          </table>
        </div>
      );
    if (node.type === "tableRow") return <tr>{children}</tr>;
    if (node.type === "tableHeader")
      return (
        <th
          scope="col"
          colSpan={tableSpan(node.attrs?.colspan)}
          rowSpan={tableSpan(node.attrs?.rowspan)}
        >
          {children}
        </th>
      );
    if (node.type === "tableCell")
      return (
        <td
          colSpan={tableSpan(node.attrs?.colspan)}
          rowSpan={tableSpan(node.attrs?.rowspan)}
        >
          {children}
        </td>
      );
    return <>{children}</>;
  };
  return visit(content);
}
export function applyCommentMarks(value: string, marks: unknown): ReactNode {
  return Array.isArray(marks)
    ? marks.reduce<ReactNode>((result, mark) => {
        const type = valueRecord(mark)?.type,
          attrs = valueRecord(valueRecord(mark)?.attrs);
        if (type === "bold") return <strong>{result}</strong>;
        if (type === "italic") return <em>{result}</em>;
        if (type === "underline") return <u>{result}</u>;
        if (type === "strike") return <s>{result}</s>;
        if (type === "code") return <code>{result}</code>;
        if (
          type === "link" &&
          typeof attrs?.href === "string" &&
          safeHref(attrs.href)
        )
          return (
            <a
              href={safeHref(attrs.href)}
              rel="noopener noreferrer nofollow"
              target="_blank"
            >
              {result}
            </a>
          );
        return result;
      }, value)
    : value;
}
export function tableSpan(value: unknown): number {
  const span = Number(value ?? 1);
  return Number.isInteger(span) && span >= 1 && span <= 30 ? span : 1;
}
