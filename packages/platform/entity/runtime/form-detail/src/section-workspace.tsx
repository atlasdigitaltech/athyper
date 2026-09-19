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
  children,
}: {
  sections: readonly EntitySectionItem[];
  activeSection: string;
  onNavigate: (key: string) => void;
  label: string;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="a-section-workspace" data-expanded={expanded}>
      <EntitySectionNavigation
        sections={sections}
        activeSection={activeSection}
        onNavigate={onNavigate}
        label={label}
      />
      <div className="a-section-workspace__content">
        <div className="a-section-workspace__controls">
          <Button
            variant="ghost"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Show navigation" : "Expand content"}
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
