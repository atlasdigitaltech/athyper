"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import type { EntityKind } from "@/lib/schema-manager/capability-flags";

import { isTabEnabled } from "@/lib/schema-manager/capability-flags";
import { cn } from "@/lib/utils";


interface TabItem {
    label: string;
    segment: string;
}

interface TabGroup {
    label: string;
    tabs: TabItem[];
}

const TAB_GROUPS: TabGroup[] = [
    {
        label: "Structural",
        tabs: [
            { label: "Fields", segment: "fields" },
            { label: "Relations", segment: "relations" },
            { label: "Diagram", segment: "diagram" },
            { label: "Indexes", segment: "indexes" },
            { label: "Versions", segment: "versions" },
            { label: "Compiled", segment: "compiled" },
        ],
    },
    {
        label: "Behavioral",
        tabs: [
            { label: "Lifecycle", segment: "lifecycle" },
            { label: "Workflows", segment: "workflows" },
            { label: "Policies", segment: "policies" },
            { label: "Validation", segment: "validation" },
        ],
    },
    {
        label: "Experience",
        tabs: [
            { label: "Forms", segment: "forms" },
            { label: "Views", segment: "views" },
        ],
    },
    {
        label: "Connectivity",
        tabs: [
            { label: "Integrations", segment: "integrations" },
        ],
    },
    {
        label: "Tenant Variation",
        tabs: [
            { label: "Overlays", segment: "overlays" },
        ],
    },
];

interface EntityTabNavProps {
    basePath: string;
    entityKind?: EntityKind;
}

export function EntityTabNav({ basePath, entityKind }: EntityTabNavProps) {
    const pathname = usePathname();

    // Filter tabs by entity capabilities
    const filteredGroups = useMemo(() => {
        if (!entityKind) return TAB_GROUPS;
        return TAB_GROUPS
            .map((group) => ({
                ...group,
                tabs: group.tabs.filter((tab) => isTabEnabled(tab.segment, entityKind)),
            }))
            .filter((group) => group.tabs.length > 0);
    }, [entityKind]);

    return (
        <nav
            className="flex items-center gap-1 border-b overflow-x-auto"
            role="tablist"
            aria-label="Entity configuration tabs"
        >
            {filteredGroups.flatMap((group, gi) => [
                ...(gi > 0
                    ? [
                          <span key={`sep-${gi}`} className="mx-0.5 text-border text-xs select-none" role="none" aria-hidden="true">
                              ·
                          </span>,
                      ]
                    : []),
                ...group.tabs.map((tab) => {
                    const href = `${basePath}/${tab.segment}`;
                    const isActive = pathname.startsWith(href);

                    return (
                        <Link
                            key={tab.segment}
                            href={href}
                            role="tab"
                            aria-selected={isActive}
                            aria-label={`${tab.label} tab`}
                            className={cn(
                                "relative inline-flex items-center px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                                isActive
                                    ? "text-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {tab.label}
                            {isActive && (
                                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" />
                            )}
                        </Link>
                    );
                }),
            ])}
        </nav>
    );
}
