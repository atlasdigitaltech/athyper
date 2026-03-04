"use client";

import { useState, useEffect, useRef } from "react";

/**
 * User suggestion type
 */
interface UserSuggestion {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
}

/**
 * Mention Autocomplete Props
 */
interface MentionAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onMention?: (userId: string, username: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  maxLength?: number;
}

/**
 * Mention Autocomplete Component
 *
 * Textarea with @mention autocomplete functionality.
 * Triggers autocomplete dropdown when user types "@".
 */
export function MentionAutocomplete({
  value,
  onChange,
  onMention,
  placeholder,
  disabled,
  className,
  maxLength,
}: MentionAutocompleteProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [mentionStart, setMentionStart] = useState(-1);
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /**
   * Fetch user suggestions based on search term
   */
  const fetchSuggestions = async (term: string) => {
    if (!term || term.length < 2) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/iam/principals?search=${encodeURIComponent(term)}&limit=10`,
        { credentials: "same-origin" }
      );

      if (!res.ok) {
        console.error("Failed to fetch user suggestions:", res.statusText);
        setSuggestions([]);
        return;
      }

      const data = await res.json();
      setSuggestions(data.data || []);
    } catch (err) {
      console.error("Failed to fetch user suggestions:", err);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle textarea change and detect @mentions
   */
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;

    onChange(newValue);

    // Detect @ character before cursor
    const textBeforeCursor = newValue.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);

      // Check if there's a space after @ (which would end the mention)
      if (!textAfterAt.includes(" ") && !textAfterAt.includes("\n")) {
        setMentionStart(lastAtIndex);
        setSearchTerm(textAfterAt);
        setShowSuggestions(true);
        setSelectedIndex(0);
        fetchSuggestions(textAfterAt);
        return;
      }
    }

    // No active mention
    setShowSuggestions(false);
  };

  /**
   * Insert selected user mention
   */
  const insertMention = (user: UserSuggestion) => {
    if (mentionStart === -1 || !textareaRef.current) return;

    const before = value.substring(0, mentionStart);
    const after = value.substring(textareaRef.current.selectionStart);
    const newValue = `${before}@${user.username} ${after}`;

    onChange(newValue);
    setShowSuggestions(false);
    setSuggestions([]);
    setMentionStart(-1);

    // Move cursor after inserted mention
    setTimeout(() => {
      if (textareaRef.current) {
        const cursorPos = mentionStart + user.username.length + 2; // +2 for "@ "
        textareaRef.current.selectionStart = cursorPos;
        textareaRef.current.selectionEnd = cursorPos;
        textareaRef.current.focus();
      }
    }, 0);

    // Notify parent
    onMention?.(user.id, user.username);
  };

  /**
   * Handle keyboard navigation in dropdown
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        break;
      case "Enter":
        if (suggestions[selectedIndex]) {
          e.preventDefault();
          insertMention(suggestions[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowSuggestions(false);
        break;
    }
  };

  /**
   * Close dropdown when clicking outside
   */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        className={className}
      />

      {/* Autocomplete Dropdown */}
      {showSuggestions && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-64 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto"
        >
          {loading ? (
            <div className="p-3 text-sm text-gray-500 text-center">Loading...</div>
          ) : suggestions.length === 0 ? (
            <div className="p-3 text-sm text-gray-500 text-center">
              {searchTerm ? "No users found" : "Start typing to search"}
            </div>
          ) : (
            suggestions.map((user, index) => (
              <button
                key={user.id}
                type="button"
                onClick={() => insertMention(user)}
                className={`w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors ${
                  index === selectedIndex ? "bg-blue-100" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-medium text-gray-600">
                      {(user.displayName || user.username).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {user.displayName || user.username}
                    </div>
                    {user.displayName && (
                      <div className="text-xs text-gray-500 truncate">@{user.username}</div>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
