"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Markdown Content Props
 */
interface MarkdownContentProps {
  content: string;
  className?: string;
}

/**
 * Markdown Content Component
 *
 * Renders markdown content with GitHub Flavored Markdown support.
 * Sanitized to prevent XSS attacks.
 */
export function MarkdownContent({ content, className = "" }: MarkdownContentProps) {
  return (
    <div className={`prose prose-sm max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Customize rendering to ensure security
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" />
          ),
          code: ({ node, inline, ...props }) =>
            inline ? (
              <code {...props} className="px-1 py-0.5 bg-gray-100 rounded text-sm font-mono" />
            ) : (
              <code {...props} className="block p-2 bg-gray-100 rounded text-sm font-mono overflow-x-auto" />
            ),
          blockquote: ({ node, ...props }) => (
            <blockquote {...props} className="border-l-4 border-gray-300 pl-4 italic text-gray-700" />
          ),
          ul: ({ node, ...props }) => (
            <ul {...props} className="list-disc list-inside space-y-1" />
          ),
          ol: ({ node, ...props }) => (
            <ol {...props} className="list-decimal list-inside space-y-1" />
          ),
          h1: ({ node, ...props }) => (
            <h1 {...props} className="text-lg font-bold mt-4 mb-2" />
          ),
          h2: ({ node, ...props }) => (
            <h2 {...props} className="text-base font-bold mt-3 mb-1" />
          ),
          h3: ({ node, ...props }) => (
            <h3 {...props} className="text-sm font-bold mt-2 mb-1" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
