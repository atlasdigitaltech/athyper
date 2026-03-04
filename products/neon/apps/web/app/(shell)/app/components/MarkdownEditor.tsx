"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Markdown Editor Props
 */
interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}

/**
 * Markdown Editor Component
 *
 * Textarea with markdown preview toggle and formatting toolbar.
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Write your comment in markdown...",
  maxLength = 5000,
  disabled = false,
}: MarkdownEditorProps) {
  const [showPreview, setShowPreview] = useState(false);

  const insertMarkdown = (before: string, after: string = "") => {
    const textarea = document.querySelector('textarea[data-markdown-editor]') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);
    const newText =
      value.substring(0, start) +
      before +
      selectedText +
      after +
      value.substring(end);

    onChange(newText);

    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + before.length + selectedText.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 border-b border-gray-300">
        <button
          type="button"
          onClick={() => insertMarkdown("**", "**")}
          disabled={disabled || showPreview}
          className="p-1 hover:bg-gray-200 rounded text-sm font-semibold disabled:opacity-50"
          title="Bold"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          onClick={() => insertMarkdown("_", "_")}
          disabled={disabled || showPreview}
          className="p-1 hover:bg-gray-200 rounded text-sm italic disabled:opacity-50"
          title="Italic"
        >
          I
        </button>
        <button
          type="button"
          onClick={() => insertMarkdown("`", "`")}
          disabled={disabled || showPreview}
          className="p-1 hover:bg-gray-200 rounded text-sm font-mono disabled:opacity-50"
          title="Code"
        >
          {"</>"}
        </button>
        <button
          type="button"
          onClick={() => insertMarkdown("[", "](url)")}
          disabled={disabled || showPreview}
          className="p-1 hover:bg-gray-200 rounded text-sm disabled:opacity-50"
          title="Link"
        >
          🔗
        </button>
        <button
          type="button"
          onClick={() => insertMarkdown("- ", "")}
          disabled={disabled || showPreview}
          className="p-1 hover:bg-gray-200 rounded text-sm disabled:opacity-50"
          title="Bullet List"
        >
          •
        </button>
        <button
          type="button"
          onClick={() => insertMarkdown("1. ", "")}
          disabled={disabled || showPreview}
          className="p-1 hover:bg-gray-200 rounded text-sm disabled:opacity-50"
          title="Numbered List"
        >
          1.
        </button>
        <button
          type="button"
          onClick={() => insertMarkdown("> ", "")}
          disabled={disabled || showPreview}
          className="p-1 hover:bg-gray-200 rounded text-sm disabled:opacity-50"
          title="Quote"
        >
          "
        </button>

        <div className="flex-1" />

        {/* Preview Toggle */}
        <button
          type="button"
          onClick={() => setShowPreview(!showPreview)}
          disabled={disabled}
          className={`px-2 py-1 text-xs rounded ${
            showPreview
              ? "bg-blue-600 text-white"
              : "bg-white text-gray-700 hover:bg-gray-100"
          } disabled:opacity-50`}
        >
          {showPreview ? "Edit" : "Preview"}
        </button>
      </div>

      {/* Editor / Preview */}
      {showPreview ? (
        <div className="p-3 min-h-[100px] max-h-[400px] overflow-y-auto prose prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {value || "_No content to preview_"}
          </ReactMarkdown>
        </div>
      ) : (
        <textarea
          data-markdown-editor
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          className="w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y min-h-[100px] max-h-[400px]"
        />
      )}
    </div>
  );
}
