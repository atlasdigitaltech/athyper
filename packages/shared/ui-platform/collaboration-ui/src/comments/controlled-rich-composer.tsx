"use client";

/**
 * ControlledRichComposer — the same TipTap+toolbar+visibility experience as
 * the main Comments panel, but parent-controlled and without an internal
 * Send button. Designed for embedding inside a parent surface (e.g. the
 * submit-for-approval modal) that owns the commit.
 *
 * No draft autosave, no attachments, no mentions network call — keeps the
 * surface synchronous so it can ride along inside a single transactional
 * submit. The Comments panel itself continues to use the full
 * RichCommentComposer for inline posting.
 */

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import type { JSONContent } from "@tiptap/core";
import {
  Bold, Italic, List,
  Globe, Lock, ShieldCheck, Check, ChevronDown,
} from "lucide-react";

import { cn } from "@athyper/theme/utils";

// ── Public types ──────────────────────────────────────────────────────────────

export type RichVisibility = "internal" | "public" | "private";

export interface RichComposerValue {
  text:        string;
  contentJson: JSONContent | null;
  contentHtml: string | null;
  visibility:  RichVisibility;
}

export interface ControlledRichComposerProps {
  value:       RichComposerValue;
  onChange:    (next: RichComposerValue) => void;
  placeholder?: string;
  autoFocus?:   boolean;
  disabled?:    boolean;
  /** When true, the visibility pill is hidden (e.g. when the parent flow
   *  binding's metadata.target already declares a fixed visibility). */
  hideVisibility?: boolean;
}

export const EMPTY_RICH_VALUE: RichComposerValue = {
  text:        "",
  contentJson: null,
  contentHtml: null,
  visibility:  "internal",
};

// ── Visibility options (kept in sync with RichCommentComposer) ────────────────

const VISIBILITY_OPTIONS: ReadonlyArray<{
  value:       RichVisibility;
  label:       string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon:        any;
  pillCls:     string;
}> = [
  {
    value:       "internal",
    label:       "Internal",
    description: "Visible to internal users only",
    icon:        ShieldCheck,
    pillCls:     "border-border/60 bg-muted/70 text-muted-foreground hover:bg-muted",
  },
  {
    value:       "public",
    label:       "Public",
    description: "Visible to external users",
    icon:        Globe,
    pillCls:     "border-success/30 bg-success/10 text-success hover:bg-success/15",
  },
  {
    value:       "private",
    label:       "Private",
    description: "Visible only to me",
    icon:        Lock,
    pillCls:     "border-warning/30 bg-warning/10 text-warning hover:bg-warning/15",
  },
];

// ── Toolbar button ────────────────────────────────────────────────────────────

function ToolbarBtn({
  onClick, isActive, title, disabled, children,
}: {
  onClick: () => void;
  isActive: boolean;
  title:   string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={cn(
        "rounded p-1 transition-colors hover:bg-accent disabled:opacity-50 disabled:hover:bg-transparent",
        isActive ? "bg-accent text-foreground" : "text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ControlledRichComposer({
  value,
  onChange,
  placeholder,
  autoFocus,
  disabled,
  hideVisibility,
}: ControlledRichComposerProps) {
  const [visMenuOpen, setVisMenuOpen] = useState(false);
  const visMenuRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: placeholder ?? "Write a comment… Use @ to mention someone",
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        validate: (href) => /^https?:\/\//.test(href) || href.startsWith("/"),
      }),
    ],
    content: value.contentJson ?? value.text ?? undefined,
    editable: !disabled,
    immediatelyRender: false,
    autofocus: autoFocus ?? false,
    onUpdate: ({ editor: ed }) => {
      const text = ed.getText().trim();
      onChange({
        ...value,
        text,
        contentJson: text ? ed.getJSON() : null,
        contentHtml: text ? ed.getHTML() : null,
      });
    },
  });

  // Close visibility menu on outside click
  useEffect(() => {
    if (!visMenuOpen) return;
    function handler(e: MouseEvent) {
      if (visMenuRef.current && !visMenuRef.current.contains(e.target as Node)) setVisMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [visMenuOpen]);

  const cur     = VISIBILITY_OPTIONS.find((o) => o.value === value.visibility)
                ?? VISIBILITY_OPTIONS[0]!;
  const CurIcon = cur.icon;

  return (
    <div className="rounded-lg border border-input bg-background text-foreground focus-within:border-ring">
      {/* Editor area */}
      <div className="px-3 pt-3">
        <EditorContent
          editor={editor}
          className={cn(
            "[&_.ProseMirror]:min-h-[80px] [&_.ProseMirror]:outline-none",
            "[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none",
            "[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left",
            "[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0",
            "[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground",
            "[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
            "[&_.ProseMirror]:text-sm [&_.ProseMirror]:leading-relaxed [&_.ProseMirror]:text-foreground",
            "[&_.ProseMirror_strong]:font-medium",
            "[&_.ProseMirror_em]:italic",
            "[&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-muted [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:text-xs [&_.ProseMirror_code]:font-mono",
            "[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5",
            "[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5",
            "[&_.ProseMirror_li]:mb-0.5",
            "[&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline",
          )}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-1 border-t border-border px-2 py-1.5">
        <div className="flex items-center gap-0.5">
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleBold().run()}
            isActive={editor?.isActive("bold") ?? false}
            title="Bold (Cmd+B)"
            disabled={disabled}
          >
            <Bold className="size-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            isActive={editor?.isActive("italic") ?? false}
            title="Italic (Cmd+I)"
            disabled={disabled}
          >
            <Italic className="size-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            isActive={editor?.isActive("bulletList") ?? false}
            title="Bullet list"
            disabled={disabled}
          >
            <List className="size-3.5" />
          </ToolbarBtn>

          {!hideVisibility && (
            <>
              <div className="mx-1 h-4 w-px bg-border" />
              <div className="relative" ref={visMenuRef}>
                <button
                  type="button"
                  disabled={disabled}
                  onMouseDown={(e) => { e.preventDefault(); setVisMenuOpen((x) => !x); }}
                  title="Set visibility"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium leading-none transition-colors",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    "disabled:opacity-50",
                    cur.pillCls,
                  )}
                >
                  <CurIcon className="size-2.5 shrink-0" />
                  {cur.label}
                  <ChevronDown className="size-2.5 opacity-60" />
                </button>

                {visMenuOpen && (
                  <div className="absolute left-0 top-full z-30 mt-1 w-52 rounded-lg border border-border bg-popover py-1 shadow-lg">
                    {VISIBILITY_OPTIONS.map((opt) => {
                      const OptIcon  = opt.icon;
                      const isActive = opt.value === value.visibility;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            onChange({ ...value, visibility: opt.value });
                            setVisMenuOpen(false);
                          }}
                          className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted"
                        >
                          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                            {isActive
                              ? <Check className="size-3.5 text-primary" />
                              : <OptIcon className="size-3.5 text-muted-foreground" />}
                          </span>
                          <span>
                            <span className="block text-xs font-medium text-foreground">{opt.label}</span>
                            <span className="block text-xs text-muted-foreground">{opt.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
