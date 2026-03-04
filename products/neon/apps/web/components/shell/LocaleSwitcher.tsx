"use client";

// components/shell/LocaleSwitcher.tsx
//
// Language dropdown in the header bar.
// Sets the neon_locale cookie and reloads the page on selection.

import { Check, Globe } from "lucide-react";
import { useEffect, useState } from "react";

import type { SessionBootstrap } from "@/lib/session-bootstrap";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LOCALES = [
  { code: "en", label: "English", native: "English" },
  { code: "ms", label: "Malay", native: "Bahasa Melayu" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "ar", label: "Arabic", native: "العربية" },
  { code: "fr", label: "French", native: "Français" },
  { code: "de", label: "German", native: "Deutsch" },
] as const;

export function LocaleSwitcher() {
  const [currentLocale, setCurrentLocale] = useState("en");

  useEffect(() => {
    const bs = (window as any).__SESSION_BOOTSTRAP__ as
      | SessionBootstrap
      | undefined;
    if (bs?.locale) setCurrentLocale(bs.locale);
  }, []);

  function handleLocaleChange(code: string) {
    if (code === currentLocale) return;
    document.cookie = `neon_locale=${code}; path=/; max-age=${365 * 24 * 60 * 60}; samesite=lax`;
    window.location.reload();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <Globe className="size-4" />
          <span className="hidden sm:inline text-xs uppercase">
            {currentLocale}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {LOCALES.map(({ code, label, native }) => (
          <DropdownMenuItem key={code} onClick={() => handleLocaleChange(code)}>
            <span className="flex-1">
              <span className="text-sm">{native}</span>
              {native !== label && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {label}
                </span>
              )}
            </span>
            {code === currentLocale && (
              <Check className="size-3.5 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
