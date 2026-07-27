"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send, Sparkles } from "lucide-react";
import type { DashboardPlane } from "@athyper/api-contracts/dashboard";

export interface DashboardHeroSuggestion {
  label: string;
  href: string;
}

export interface DashboardHeroExperience {
  plane: DashboardPlane;
  copilotLabel: string;
  suggestions: readonly DashboardHeroSuggestion[];
  placeholders: readonly string[];
  onSearch: (query: string) => void;
}

export interface DashboardHeroProps extends DashboardHeroExperience {
  userName: string;
}

export function timeOfDayGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour >= 5  && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

const PLACEHOLDER_ROTATION_MS = 3500;

export function DashboardHero({
  userName,
  copilotLabel,
  suggestions,
  placeholders,
  onSearch,
}: DashboardHeroProps) {
  const [query, setQuery] = useState("");
  const [greeting, setGreeting] = useState("Hello");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { setGreeting(timeOfDayGreeting(new Date())); }, []);

  useEffect(() => {
    if (placeholders.length <= 1) return;
    const timer = setInterval(() => {
      const el = inputRef.current;
      if (!el || el.value.length > 0 || el === document.activeElement) return;
      setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
    }, PLACEHOLDER_ROTATION_MS);
    return () => clearInterval(timer);
  }, [placeholders.length]);

  const displayName = userName.trim();
  const currentPlaceholder = placeholders[placeholderIndex] ?? "";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    onSearch(trimmed);
  };

  return (
    <header>
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-muted/70 via-muted/40 to-primary/[0.06] p-5 sm:p-7">
        <div
          aria-hidden
          className="atlas-aurora pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/25 opacity-60 blur-3xl"
        />
        <div
          aria-hidden
          className="atlas-aurora pointer-events-none absolute -bottom-32 -left-20 h-64 w-64 rounded-full bg-primary/15 opacity-50 blur-3xl"
          style={{ animationDelay: "-9s", animationDuration: "22s" }}
        />
        <div className="relative flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h1 className="atlas-enter text-2xl font-semibold tracking-tight text-foreground sm:text-3xl" suppressHydrationWarning>
            {greeting}, {displayName}
          </h1>
          <button
            type="button"
            onClick={() => inputRef.current?.focus()}
            aria-label="Focus Ask Atlas input"
            className="atlas-enter-scale group inline-flex items-center gap-2 rounded-md bg-background/70 px-2.5 py-1 text-xs font-medium shadow-sm ring-1 ring-border/60 transition-all duration-200 hover:-translate-y-0.5 hover:bg-background hover:shadow-md hover:ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            style={{ animationDelay: "120ms" }}
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" aria-hidden />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            </span>
            <Sparkles className="atlas-spark h-3.5 w-3.5 text-primary" aria-hidden />
            <span className="atlas-shimmer">Ask Atlas</span>
            <span className="text-muted-foreground/80">· your {copilotLabel} copilot</span>
          </button>
        </div>

        <div className="atlas-enter mt-5" style={{ animationDelay: "200ms" }}>
          <form
            onSubmit={handleSubmit}
            role="search"
            className="atlas-breathe group/form relative flex items-center gap-2 rounded-xl bg-background px-4 py-3 shadow-sm ring-1 ring-border/40 transition-shadow"
          >
            <label htmlFor="dashboard-hero-search" className="sr-only">Ask Atlas</label>
            <input
              ref={inputRef}
              id="dashboard-hero-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={currentPlaceholder}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-[15px] caret-primary placeholder:text-muted-foreground placeholder:transition-opacity focus:outline-none"
            />
            <button
              type="submit"
              disabled={query.trim().length === 0}
              aria-label="Ask Atlas"
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
            >
              <Send className="h-4 w-4 transition-transform duration-200 group-hover/form:translate-x-0.5" />
            </button>
          </form>
        </div>

        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          {suggestions.map(({ label, href }, index) => (
            <a
              key={label}
              href={href}
              className="atlas-enter rounded-full bg-background/60 px-3 py-1 text-xs text-muted-foreground ring-1 ring-border/40 transition-all duration-200 hover:-translate-y-0.5 hover:bg-background hover:text-foreground hover:shadow-sm hover:ring-border"
              style={{ animationDelay: `${300 + index * 60}ms` }}
            >
              {label}
            </a>
          ))}
        </div>
      </div>
    </header>
  );
}
