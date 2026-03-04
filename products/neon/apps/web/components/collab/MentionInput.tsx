"use client";

import {
  useState,
  useRef,
  useCallback,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

import { Textarea } from "@/components/ui/textarea";
import { useMentions, type MentionUser } from "@/lib/collab";
import { cn } from "@/lib/utils";

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
  placeholder = "Write a comment... Use @ to mention someone",
  rows = 3,
  disabled,
  className,
}: MentionInputProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { users } = useMentions(mentionQuery);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      onChange(text);

      const cursorPos = e.target.selectionStart;
      const textBeforeCursor = text.substring(0, cursorPos);
      const match = textBeforeCursor.match(/@(\w*)$/);

      if (match) {
        setMentionQuery(match[1]);
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

      // Refocus textarea
      requestAnimationFrame(() => {
        const pos = mentionStart + user.username.length + 2; // @username + space
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
        e.preventDefault();
        insertMention(users[selectedIndex]);
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
                e.preventDefault(); // keep textarea focus
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
