"use client";

/**
 * MentionInput — Textarea with @-mention autocomplete.
 *
 * Searches for users via GET /api/collab/mentions?q= when the user types @.
 * Keyboard: ArrowUp/Down to navigate, Enter/Tab to insert, Escape to dismiss.
 */

import {
  useState,
  useRef,
  useCallback,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";

import { Textarea } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";

interface MentionUser {
  id: string;
  username: string;
  displayName: string;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
}

export function MentionInput({
  value,
  onChange,
  placeholder = "Write a comment… Use @ to mention someone",
  rows = 3,
  disabled,
  className,
}: MentionInputProps) {
  const [mentionQuery, setMentionQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: usersData } = useQuery<{ data: MentionUser[] }>({
    queryKey: ["collab", "mentions", mentionQuery],
    queryFn: async ({ signal }) => {
      if (!mentionQuery) return { data: [] };
      const res = await fetch(`/api/collab/mentions?q=${encodeURIComponent(mentionQuery)}`, {
        signal,
        cache: "no-store",
      });
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: MentionUser[] }>;
    },
    enabled: showDropdown && mentionQuery.length > 0,
    staleTime: 30 * 1000,
  });

  const users = usersData?.data ?? [];

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      onChange(text);

      const cursorPos = e.target.selectionStart;
      const textBeforeCursor = text.substring(0, cursorPos);
      const match = textBeforeCursor.match(/@(\w*)$/);

      if (match) {
        setMentionQuery(match[1] ?? "");
        setMentionStart(match.index!);
        setShowDropdown(true);
        setSelectedIndex(0);
      } else {
        setShowDropdown(false);
        setMentionQuery("");
      }
    },
    [onChange],
  );

  const insertMention = useCallback(
    (user: MentionUser) => {
      const before = value.substring(0, mentionStart);
      const cursorPos = textareaRef.current?.selectionStart ?? value.length;
      const after = value.substring(cursorPos);

      const newValue = `${before}@${user.username} ${after}`;
      onChange(newValue);
      setShowDropdown(false);
      setMentionQuery("");

      requestAnimationFrame(() => {
        const pos = mentionStart + user.username.length + 2;
        textareaRef.current?.setSelectionRange(pos, pos);
        textareaRef.current?.focus();
      });
    },
    [value, mentionStart, onChange],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!showDropdown || users.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, users.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (users[selectedIndex]) {
          e.preventDefault();
          insertMention(users[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        setShowDropdown(false);
      }
    },
    [showDropdown, users, selectedIndex, insertMention],
  );

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={cn("resize-none", className)}
      />

      {showDropdown && users.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-48 w-64 overflow-y-auto rounded-md border bg-popover shadow-md">
          {users.map((user, i) => (
            <button
              key={user.id}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent",
                i === selectedIndex && "bg-accent",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(user);
              }}
            >
              <span className="font-medium">@{user.username}</span>
              <span className="truncate text-muted-foreground">
                {user.displayName}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
