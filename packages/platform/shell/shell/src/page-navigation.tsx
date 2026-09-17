"use client";
import React, { useEffect, useState, type ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@athyper/platform-ui";

export interface PageNavigationTabItem {
  readonly value: string;
  readonly label: ReactNode;
  readonly content: ReactNode;
  /** "lazy" defers mounting until selected — the manual-activation case for a slow-loading panel. */
  readonly mount?: "persistent" | "lazy";
}

export interface PageNavigationTabsProps {
  readonly kind: "tabs";
  readonly items: readonly PageNavigationTabItem[];
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly ariaLabel: string;
  /** Renders between the tab list and the panels, visible regardless of which tab is selected (e.g. a persistent lifecycle/status summary). */
  readonly aside?: ReactNode;
  readonly className?: string;
}

/** Only the tabs kind exists today; route-links and workflow-steps are separate kinds once a real consumer needs them. */
export function PageNavigation({ items, value, onValueChange, ariaLabel, aside, className }: PageNavigationTabsProps) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className={className}>
      <TabsList aria-label={ariaLabel}>
        {items.map((item) => (
          <TabsTrigger key={item.value} value={item.value}>
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {aside}
      {items.map((item) => (
        <TabsContent key={item.value} value={item.value} mount={item.mount}>
          {item.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}

export interface DeepLinkedTabStateOptions {
  readonly initial: string;
  /** Normalizes/validates a raw candidate (from the URL or storage) into a supported value; domain-specific aliasing stays with the caller. */
  readonly normalize: (raw: string) => string;
  /** Omit to sync from the URL hash only, with no cross-reload persistence. */
  readonly storageKey?: string;
}

/**
 * Restores the active tab from session storage (if a storageKey is given) or the URL hash, follows
 * hashchange, and replaces (never pushes) history on selection — matching the existing Business Partner
 * request-detail behavior this was extracted from. A future consumer that wants Back/Forward between tabs
 * needs its own option; this intentionally doesn't add one without a second consumer asking for it.
 */
export function useDeepLinkedTabState({ initial, normalize, storageKey }: DeepLinkedTabStateOptions) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const sync = () => {
      const candidate = (storageKey ? window.sessionStorage.getItem(storageKey) : null) ?? window.location.hash.slice(1);
      setValue(normalize(candidate));
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [storageKey]);
  function select(raw: string) {
    const next = normalize(raw);
    setValue(next);
    if (storageKey) window.sessionStorage.setItem(storageKey, next);
    window.history.replaceState(window.history.state, "", `#${next}`);
  }
  return { value, select };
}
