/**
 * MessageSearchBar - Search input with clear button
 *
 * Features:
 * - Controlled input
 * - Clear button
 * - Loading indicator
 * - Keyboard shortcuts (Escape to clear)
 */

"use client";

import { Search, X, Loader2 } from "lucide-react";

import { Button } from "../button";
import { Input } from "../input";
import { cn } from "../lib/utils";

export interface MessageSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  isSearching?: boolean;
  placeholder?: string;
  className?: string;
}

export function MessageSearchBar({
  value,
  onChange,
  onClear,
  isSearching = false,
  placeholder = "Search messages...",
  className,
}: MessageSearchBarProps) {
  const handleClear = () => {
    onChange("");
    onClear?.();
  };

  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            handleClear();
          }
        }}
        className="pl-9 pr-20"
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {isSearching && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {value && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
