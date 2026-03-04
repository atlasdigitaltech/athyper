"use client";

// components/mesh/list/ViewSwitcher.tsx
//
// Unified view mode dropdown.
// Replaces the adaptive ViewModeToggle with a single dropdown that shows
// the current view, available/disabled views with reasons, and links
// to View Settings and Adapt Filters.

import {
    CalendarRange,
    Check,
    ChevronDown,
    Filter,
    Kanban,
    LayoutGrid,
    List,
    Settings2,
    SlidersHorizontal,
    TreePine,
} from "lucide-react";

import { getUnavailableReason } from "./explorer-capabilities";
import { useListPage, useListPageActions } from "./ListPageContext";

import type { ViewModeDef } from "./types";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";



const ALL_VIEW_MODES: ViewModeDef[] = [
    { mode: "tree", label: "Tree", icon: TreePine },
    { mode: "table", label: "List", icon: List },
    { mode: "table-columns", label: "Columns", icon: SlidersHorizontal },
    { mode: "card-grid", label: "Cards", icon: LayoutGrid },
    { mode: "kanban", label: "Board", icon: Kanban },
    { mode: "timeline", label: "Timeline", icon: CalendarRange },
];

export function ViewSwitcher<T>() {
    const { state, config, capabilities } = useListPage<T>();
    const actions = useListPageActions();

    const available = config.availableViews ?? ["table", "card-grid"];
    const modes = ALL_VIEW_MODES.filter((m) => available.includes(m.mode));

    if (modes.length <= 1) return null;

    const active = modes.find((m) => m.mode === state.viewMode) ?? modes[0];

    return (
        <TooltipProvider delayDuration={300}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 px-3">
                        <active.icon className="size-3.5" />
                        <span className="text-xs">{active.label}</span>
                        <ChevronDown className="size-3 text-muted-foreground" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    {modes.map((m) => {
                        const reason = getUnavailableReason(m.mode, config, capabilities);
                        const disabled = !!reason;
                        const isCurrent = m.mode === state.viewMode;

                        if (disabled) {
                            return (
                                <Tooltip key={m.mode}>
                                    <TooltipTrigger asChild>
                                        <div>
                                            <DropdownMenuItem
                                                disabled
                                                className="gap-2 text-xs opacity-50"
                                            >
                                                <m.icon className="size-3.5" />
                                                {m.label}
                                            </DropdownMenuItem>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="max-w-[200px] text-xs">
                                        {reason}
                                    </TooltipContent>
                                </Tooltip>
                            );
                        }

                        return (
                            <DropdownMenuItem
                                key={m.mode}
                                className="gap-2 text-xs"
                                onClick={() => actions.setViewMode(m.mode)}
                            >
                                <span className="flex size-3.5 items-center justify-center">
                                    {isCurrent ? <Check className="size-3.5" /> : null}
                                </span>
                                <m.icon className="size-3.5" />
                                {m.label}
                            </DropdownMenuItem>
                        );
                    })}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        className="gap-2 text-xs"
                        onClick={() => actions.openSettings()}
                    >
                        <Settings2 className="size-3.5" />
                        View Settings...
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        className="gap-2 text-xs"
                        onClick={() => actions.openAdaptFilters()}
                    >
                        <Filter className="size-3.5" />
                        Adapt Filters...
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </TooltipProvider>
    );
}

// Re-export for backwards compatibility
export { ViewSwitcher as ViewModeToggle };
