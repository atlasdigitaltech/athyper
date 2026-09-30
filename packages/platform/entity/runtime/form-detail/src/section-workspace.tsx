"use client";
import { useState, type ReactNode } from "react";
import { Button } from "@athyper/platform-ui";
import {
  EntitySectionNavigation,
  type EntitySectionItem,
} from "./section-navigation";
/** Focused task views using the same section navigation as entity detail pages. */
export function EntitySectionWorkspace({
  sections,
  activeSection,
  onNavigate,
  label,
  navigation = "rail",
  children,
}: {
  sections: readonly EntitySectionItem[];
  activeSection: string;
  onNavigate: (key: string) => void;
  label: string;
  /** Header-mode navigation owns section selection, so no duplicate rail is rendered. */
  readonly navigation?: "rail" | "header";
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`a-section-workspace${navigation === "header" ? " a-section-workspace--header-navigation" : ""}`} data-expanded={expanded}>
      {navigation === "rail" ? <EntitySectionNavigation
        sections={sections}
        activeSection={activeSection}
        onNavigate={onNavigate}
        label={label}
        trailing={expanded ? <Button
          className="a-section-workspace__restore"
          variant="ghost"
          aria-expanded={expanded}
          onClick={() => setExpanded(false)}
        >
          Show navigation
        </Button> : undefined}
      /> : null}
      <div className="a-section-workspace__content">
        {navigation === "rail" ? <div className="a-section-workspace__controls">
          <Button
            variant="ghost"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            Expand content
          </Button>
        </div> : null}
        {children}
      </div>
    </div>
  );
}
