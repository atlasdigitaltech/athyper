"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import type { JSONContent } from "@tiptap/core";
import { useQuery } from "@tanstack/react-query";
import {
  Send, Loader2, Bold, Italic, List,
  Paperclip, X, AtSign, Globe, Lock, ShieldCheck, Check, Table2, ChevronDown,
} from "lucide-react";
import Table        from "@tiptap/extension-table";
import TableRow     from "@tiptap/extension-table-row";
import TableHeader  from "@tiptap/extension-table-header";
import TableCell    from "@tiptap/extension-table-cell";

import { Button } from "@athyper/ui/primitives";

// ── Table paste helpers (module-level, no per-render cost) ────────────────────

const SAFE_CSS_PROPS = new Set([
  "background-color", "color", "text-align", "font-weight", "font-style",
  "border", "border-top", "border-bottom", "border-left", "border-right",
  "width", "min-width", "max-width", "padding", "vertical-align",
]);

function sanitizeInlineStyle(raw: string): string {
  return raw.split(";")
    .filter(Boolean)
    .filter((decl) => {
      const prop = decl.split(":")[0]?.trim().toLowerCase() ?? "";
      return SAFE_CSS_PROPS.has(prop);
    })
    .join(";");
}

function sanitizeTableHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  // Remove Office/Word namespace elements (o:p, v:shape, etc.)
  Array.from(div.querySelectorAll("*")).forEach((el) => {
    if (el.tagName.includes(":")) el.remove();
  });
  // Strip all unsafe attributes from table structure elements, keeping only safe ones
  div.querySelectorAll("table, thead, tbody, tfoot, tr, th, td, colgroup, col").forEach((el) => {
    const htmlEl = el as HTMLElement;
    const rawStyle = htmlEl.getAttribute("style") ?? "";
    const safeStyle = sanitizeInlineStyle(rawStyle);
    const keep = new Set(["colspan", "rowspan"]);
    Array.from(htmlEl.attributes).forEach((attr) => {
      if (!keep.has(attr.name) && attr.name !== "style") htmlEl.removeAttribute(attr.name);
    });
    if (safeStyle) htmlEl.setAttribute("style", safeStyle);
    else htmlEl.removeAttribute("style");
  });
  return div.innerHTML;
}

function getTableDimensions(html: string): { rows: number; cols: number } {
  const div = document.createElement("div");
  div.innerHTML = html;
  const table = div.querySelector("table");
  if (!table) return { rows: 0, cols: 0 };
  const rows = table.querySelectorAll("tr").length;
  const cols = table.querySelector("tr")?.querySelectorAll("th, td").length ?? 0;
  return { rows, cols };
}

// Extended cell/header that preserve inline styles through TipTap's schema
const StyledTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: null,
        parseHTML: (el) => sanitizeInlineStyle(el.getAttribute("style") ?? "") || null,
        renderHTML: (attrs) => (attrs.style ? { style: attrs.style as string } : {}),
      },
    };
  },
});

const StyledTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: null,
        parseHTML: (el) => sanitizeInlineStyle(el.getAttribute("style") ?? "") || null,
        renderHTML: (attrs) => (attrs.style ? { style: attrs.style as string } : {}),
      },
    };
  },
});
import { cn } from "@athyper/theme/utils";
import { useDraft } from "../hooks/collab";
import { useCommentAttachments } from "../hooks/attachments";
import { StagedAttachmentChip } from "../attachments/AttachmentChip";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RichCommentComposerProps {
  entityType: string;
  entityId: string;
  parentCommentId?: string;
  onSubmit: (
    text: string,
    attachmentIds: string[],
    contentJson?: JSONContent,
    contentHtml?: string,
    visibility?: string,
  ) => Promise<void>;
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Pre-populate editor with existing rich content (for edit mode) */
  initialContent?: JSONContent | string;
}

interface PasteNotice {
  rows: number;
  cols: number;
  plainText: string;
}

interface MentionUser {
  id: string;
  username: string;
  displayName: string;
}

interface MentionState {
  query: string;
  docFrom: number;
  screenX: number;
  screenBottom: number;
}

// ── Toolbar button ────────────────────────────────────────────────────────────

function ToolbarBtn({
  onClick,
  isActive,
  title,
  children,
}: {
  onClick: () => void;
  isActive: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault(); // keep editor focus
        onClick();
      }}
      title={title}
      className={cn(
        "rounded p-1 transition-colors hover:bg-accent",
        isActive ? "bg-accent text-foreground" : "text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ── Mention dropdown ──────────────────────────────────────────────────────────

function MentionDropdown({
  query,
  screenX,
  screenBottom,
  onSelect,
  onClose,
  selectedIndexRef,
}: {
  query: string;
  screenX: number;
  screenBottom: number;
  onSelect: (user: MentionUser) => void;
  onClose: () => void;
  selectedIndexRef: React.MutableRefObject<number>;
}) {
  const { data } = useQuery<{ data: MentionUser[] }>({
    queryKey: ["collab", "mentions", query],
    queryFn: async ({ signal }) => {
      if (!query) return { data: [] };
      const res = await fetch(`/api/collab/mentions?q=${encodeURIComponent(query)}`, {
        signal,
        cache: "no-store",
      });
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: MentionUser[] }>;
    },
    enabled: query.length > 0,
    staleTime: 30_000,
  });

  const users = data?.data ?? [];

  useEffect(() => {
    selectedIndexRef.current = 0;
  }, [query, selectedIndexRef]);

  if (users.length === 0) return null;

  return (
    <div
      className="fixed z-50 max-h-48 w-56 overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
      style={{ left: screenX, top: screenBottom + 4 }}
    >
      {users.map((user, i) => (
        <button
          key={user.id}
          type="button"
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent",
            i === selectedIndexRef.current && "bg-accent",
          )}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(user);
          }}
        >
          <span className="font-medium">@{user.username}</span>
          <span className="truncate text-xs text-muted-foreground">{user.displayName}</span>
        </button>
      ))}
    </div>
  );
}

// ── Visibility options ────────────────────────────────────────────────────────

const VISIBILITY_OPTIONS = [
  {
    value:       "internal" as const,
    label:       "Internal",
    description: "Visible to internal users only",
    icon:        ShieldCheck,
    pillCls:     "border-border/60 bg-muted/70 text-muted-foreground hover:bg-muted",
  },
  {
    value:       "public" as const,
    label:       "Public",
    description: "Visible to external users",
    icon:        Globe,
    pillCls:     "border-success/30 bg-success/10 text-success hover:bg-success/15",
  },
  {
    value:       "private" as const,
    label:       "Private",
    description: "Visible only to me",
    icon:        Lock,
    pillCls:     "border-warning/30 bg-warning/10 text-warning hover:bg-warning/15",
  },
] as const;

type CommentVisibility = typeof VISIBILITY_OPTIONS[number]["value"];

// ── Main component ────────────────────────────────────────────────────────────

export function RichCommentComposer({
  entityType,
  entityId,
  parentCommentId,
  onSubmit,
  onCancel,
  placeholder,
  autoFocus,
  initialContent,
}: RichCommentComposerProps) {
  const [isExpanded, setIsExpanded]     = useState(autoFocus ?? false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mentionState, setMentionState] = useState<MentionState | null>(null);
  const [visibility, setVisibility]     = useState<CommentVisibility>("internal");
  const [visMenuOpen, setVisMenuOpen]   = useState(false);
  const [pasteNotice, setPasteNotice]   = useState<PasteNotice | null>(null);

  const fileInputRef       = useRef<HTMLInputElement>(null);
  const visMenuRef         = useRef<HTMLDivElement>(null);
  // Ref so handlePaste (a stale closure inside useEditor) can set React state
  const pasteNoticeRef     = useRef<typeof setPasteNotice>(() => {});
  pasteNoticeRef.current   = setPasteNotice;
  const addFilesRef        = useRef<(files: File[] | FileList) => void>(() => {});
  const mentionSelectedRef = useRef(0);
  const hasRestoredDraft   = useRef(false);

  const { staged, attachmentIds, isUploading, addFiles, remove, retry, reset } =
    useCommentAttachments();
  addFilesRef.current = addFiles;

  const { draft, saveDraft, deleteDraft } = useDraft(entityType, entityId, parentCommentId);

  // ── Editor setup ───────────────────────────────────────────────────────────

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
      Table.configure({ resizable: false }),
      TableRow,
      StyledTableHeader,
      StyledTableCell,
    ],
    content: initialContent ?? undefined,
    immediatelyRender: false,
    editorProps: {
      transformPastedHTML: (html) => {
        const div = document.createElement("div");
        div.innerHTML = html;
        // Only process if HTML contains a table — otherwise let TipTap handle normally
        if (!div.querySelector("table")) return html;
        return sanitizeTableHtml(html);
      },
      handlePaste: (_view, event) => {
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageFiles = items
          .filter((i) => i.kind === "file" && i.type.startsWith("image/"))
          .map((i) => i.getAsFile())
          .filter((f): f is File => f !== null);

        const htmlData = event.clipboardData?.getData("text/html") ?? "";
        if (htmlData) {
          const tmp = document.createElement("div");
          tmp.innerHTML = htmlData;
          if (tmp.querySelector("table")) {
            // Show paste notice (pasteNoticeRef avoids stale closure)
            const { rows, cols } = getTableDimensions(htmlData);
            const plainText = event.clipboardData?.getData("text/plain") ?? "";
            pasteNoticeRef.current({ rows, cols, plainText });
            // Attach any images alongside the table
            if (imageFiles.length > 0) addFilesRef.current(imageFiles);
            // Let TipTap handle the actual insertion via transformPastedHTML + table schema
            return false;
          }
        }

        if (imageFiles.length > 0) {
          event.preventDefault();
          addFilesRef.current(imageFiles);
          return true;
        }
        return false;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter(
          (f) => f.type.startsWith("image/"),
        );
        if (files.length > 0) {
          event.preventDefault();
          addFilesRef.current(files);
          return true;
        }
        return false;
      },
    },
    onFocus: () => setIsExpanded(true),
    onUpdate: ({ editor: ed }) => {
      const text = ed.getText();
      saveDraft(text.trim().slice(0, 50000), ed.getJSON());

      // @mention detection
      const { from } = ed.state.selection;
      if (from === 0) {
        setMentionState(null);
        return;
      }
      const textBefore = ed.state.doc.textBetween(Math.max(0, from - 60), from);
      const match = textBefore.match(/@(\w*)$/);
      if (match) {
        try {
          const coords = ed.view.coordsAtPos(from);
          setMentionState({
            query:        match[1] ?? "",
            docFrom:      from - (match[0].length),
            screenX:      coords.left,
            screenBottom: coords.bottom,
          });
        } catch {
          setMentionState(null);
        }
      } else {
        setMentionState(null);
      }
    },
  });

  // Restore draft once when editor + draft both become available
  useEffect(() => {
    if (!editor || hasRestoredDraft.current || initialContent) return;
    if (!draft) return;
    hasRestoredDraft.current = true;
    const richDraft = draft as { contentJson?: JSONContent; draftText?: string };
    if (richDraft.contentJson) {
      editor.commands.setContent(richDraft.contentJson);
    } else if (richDraft.draftText) {
      editor.commands.setContent(richDraft.draftText);
    }
  }, [editor, draft, initialContent]);

  // Auto-dismiss paste notice after 8 s
  useEffect(() => {
    if (!pasteNotice) return;
    const t = setTimeout(() => setPasteNotice(null), 8000);
    return () => clearTimeout(t);
  }, [pasteNotice]);

  const convertTableToText = useCallback(() => {
    if (!editor || !pasteNotice) return;
    editor.commands.undo();
    if (pasteNotice.plainText) {
      const lines = pasteNotice.plainText.split("\n").map((l) => l.trim()).filter(Boolean);
      editor.commands.insertContent(lines.map((l) => `<p>${l}</p>`).join(""));
    }
    setPasteNotice(null);
  }, [editor, pasteNotice]);

  // Close visibility menu on outside click
  useEffect(() => {
    if (!visMenuOpen) return;
    function handler(e: MouseEvent) {
      if (visMenuRef.current && !visMenuRef.current.contains(e.target as Node)) setVisMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [visMenuOpen]);

  // Cmd/Ctrl+Enter to submit
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const handler = (e: Event) => {
      const ke = e as unknown as globalThis.KeyboardEvent;
      if ((ke.metaKey || ke.ctrlKey) && ke.key === "Enter") {
        void handleSubmit();
      }
    };
    dom.addEventListener("keydown", handler);
    return () => dom.removeEventListener("keydown", handler);
  });

  // Arrow key navigation for mention dropdown
  const handleEditorKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (!mentionState) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        mentionSelectedRef.current =
          e.key === "ArrowDown"
            ? mentionSelectedRef.current + 1
            : Math.max(0, mentionSelectedRef.current - 1);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionState(null);
      }
    },
    [mentionState],
  );

  // ── Insert mention ─────────────────────────────────────────────────────────

  const insertMention = useCallback(
    (user: MentionUser) => {
      if (!editor || !mentionState) return;
      const { from: cursorPos } = editor.state.selection;
      editor
        .chain()
        .focus()
        .deleteRange({ from: mentionState.docFrom, to: cursorPos })
        .insertContent(`@${user.username} `)
        .run();
      setMentionState(null);
    },
    [editor, mentionState],
  );

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!editor || isSubmitting) return;
    const text = editor.getText().trim();
    if (!text && attachmentIds.length === 0) return;

    setIsSubmitting(true);
    try {
      await onSubmit(
        text.slice(0, 50000),
        attachmentIds,
        editor.getJSON(),
        editor.getHTML(),
        visibility,
      );
      editor.commands.clearContent();
      deleteDraft();
      reset();
      setIsExpanded(false);
      setMentionState(null);
    } finally {
      setIsSubmitting(false);
    }
  }, [editor, attachmentIds, isSubmitting, onSubmit, deleteDraft, reset, visibility]);

  const canSubmit =
    editor
      ? (editor.getText().trim().length > 0 || attachmentIds.length > 0) && !isUploading
      : false;

  // ── Collapsed state ────────────────────────────────────────────────────────

  if (!isExpanded) {
    return (
      <div
        role="button"
        tabIndex={0}
        className="cursor-text rounded-lg border border-input bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={() => {
          setIsExpanded(true);
          requestAnimationFrame(() => editor?.commands.focus());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            setIsExpanded(true);
            requestAnimationFrame(() => editor?.commands.focus());
          }
        }}
      >
        {placeholder ?? "Write a comment…"}
      </div>
    );
  }

  // ── Expanded state ─────────────────────────────────────────────────────────

  return (
    <div className="rounded-lg border border-ring bg-background text-foreground shadow-sm focus-within:border-ring">
      {/* Editor area */}
      <div
        className="px-3 pt-3"
        onKeyDown={handleEditorKeyDown}
      >
        <EditorContent
          editor={editor}
          className={cn(
            "[&_.ProseMirror]:min-h-[80px] [&_.ProseMirror]:outline-none",
            "[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none",
            "[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left",
            "[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0",
            "[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground",
            "[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
            // Prose styles
            "[&_.ProseMirror]:text-sm [&_.ProseMirror]:leading-relaxed [&_.ProseMirror]:text-foreground",
            "[&_.ProseMirror_strong]:font-semibold",
            "[&_.ProseMirror_em]:italic",
            "[&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-muted [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:text-doc-support [&_.ProseMirror_code]:font-mono",
            "[&_.ProseMirror_pre]:rounded-md [&_.ProseMirror_pre]:bg-muted [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_pre]:text-xs [&_.ProseMirror_pre]:font-mono [&_.ProseMirror_pre]:overflow-x-auto",
            "[&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-border [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:text-muted-foreground",
            "[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5",
            "[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5",
            "[&_.ProseMirror_li]:mb-0.5",
            "[&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline",
            // Table styles inside editor
            "[&_.ProseMirror_table]:w-full [&_.ProseMirror_table]:border-collapse [&_.ProseMirror_table]:text-xs [&_.ProseMirror_table]:my-2",
            "[&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-border [&_.ProseMirror_th]:bg-muted [&_.ProseMirror_th]:px-2 [&_.ProseMirror_th]:py-1 [&_.ProseMirror_th]:font-semibold [&_.ProseMirror_th]:text-left [&_.ProseMirror_th]:text-foreground",
            "[&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-border [&_.ProseMirror_td]:px-2 [&_.ProseMirror_td]:py-1 [&_.ProseMirror_td]:text-foreground",
            "[&_.ProseMirror_.tableWrapper]:overflow-x-auto",
          )}
        />
      </div>

      {/* Paste notice — shown when a table is pasted */}
      {pasteNotice && (
        <div className="mx-3 mb-1 mt-2 flex items-center justify-between gap-2 rounded-md border border-border bg-muted/60 px-3 py-1.5 text-doc-subtitle text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Table2 className="size-3 shrink-0" />
            Table pasted · {pasteNotice.cols} col{pasteNotice.cols !== 1 ? "s" : ""} × {pasteNotice.rows} row{pasteNotice.rows !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-1">
            {pasteNotice.plainText && (
              <button
                type="button"
                onClick={convertTableToText}
                className="rounded px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
              >
                Convert to text
              </button>
            )}
            <button
              type="button"
              onClick={() => setPasteNotice(null)}
              className="rounded px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}

      {/* Staged attachments */}
      {staged.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pb-2">
          {staged.map((item) => (
            <StagedAttachmentChip key={item.key} item={item} onRemove={remove} onRetry={retry} />
          ))}
        </div>
      )}

      {/* Toolbar + actions */}
      <div className="flex items-center justify-between gap-1 border-t border-border px-2 py-1.5">
        {/* Formatting tools */}
        <div className="flex items-center gap-0.5">
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleBold().run()}
            isActive={editor?.isActive("bold") ?? false}
            title="Bold (Cmd+B)"
          >
            <Bold className="size-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            isActive={editor?.isActive("italic") ?? false}
            title="Italic (Cmd+I)"
          >
            <Italic className="size-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            isActive={editor?.isActive("bulletList") ?? false}
            title="Bullet list"
          >
            <List className="size-3.5" />
          </ToolbarBtn>

          <div className="mx-1 h-4 w-px bg-border" />

          <ToolbarBtn
            onClick={() => fileInputRef.current?.click()}
            isActive={false}
            title="Attach file"
          >
            <Paperclip className="size-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor?.chain().focus().insertContent("@").run()}
            isActive={false}
            title="Mention someone"
          >
            <AtSign className="size-3.5" />
          </ToolbarBtn>

          <div className="mx-1 h-4 w-px bg-border" />

          {/* Visibility picker — pill matches attachment VisibilityPill style */}
          {(() => {
            const cur = VISIBILITY_OPTIONS.find((o) => o.value === visibility)!;
            const CurIcon = cur.icon;
            return (
              <div className="relative" ref={visMenuRef}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setVisMenuOpen((x) => !x); }}
                  title="Set comment visibility"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-doc-support font-medium leading-none transition-colors",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
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
                      const OptIcon = opt.icon;
                      const isActive = opt.value === visibility;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); setVisibility(opt.value); setVisMenuOpen(false); }}
                          className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted"
                        >
                          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                            {isActive
                              ? <Check className="size-3.5 text-primary" />
                              : <OptIcon className="size-3.5 text-muted-foreground" />}
                          </span>
                          <span>
                            <span className="block text-xs font-medium text-foreground">{opt.label}</span>
                            <span className="block text-doc-support text-muted-foreground">{opt.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Right side: shortcut hint + cancel + send */}
        <div className="flex items-center gap-2">
          {isUploading && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />Uploading…
            </span>
          )}
          <span className="hidden select-none rounded border border-border bg-muted px-1 py-0.5 text-doc-support text-muted-foreground sm:inline">
            ⌘↵
          </span>
          {onCancel && (
            <Button type="button" variant="ghost" size="sm"
              onClick={() => { onCancel(); setIsExpanded(false); }}
              disabled={isSubmitting}
            >
              <X className="mr-1 size-3" />Cancel
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={!canSubmit || isSubmitting}
            onClick={() => void handleSubmit()}
          >
            {isSubmitting
              ? <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              : <Send className="mr-1.5 size-3.5" />}
            {parentCommentId ? "Reply" : "Send"}
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
        accept="image/*,application/pdf,.xlsx,.xls,.csv,.docx,.doc,.txt,.zip"
      />

      {/* @mention dropdown */}
      {mentionState && (
        <MentionDropdown
          query={mentionState.query}
          screenX={mentionState.screenX}
          screenBottom={mentionState.screenBottom}
          onSelect={insertMention}
          onClose={() => setMentionState(null)}
          selectedIndexRef={mentionSelectedRef}
        />
      )}
    </div>
  );
}
