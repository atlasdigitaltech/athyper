"use client";

// components/shell/ViewportSwitcher.tsx
//
// Toggle between Desktop / Tablet / Mobile viewport preview.
// Only rendered when NODE_ENV === "development".
// Applies inline styles directly to the shell-container element for reliable width constraining.

import { Monitor, Smartphone, Tablet } from "lucide-react";
import { useCallback, useState } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Viewport = "desktop" | "tablet" | "mobile";

const VIEWPORT_WIDTHS: Record<Viewport, number | null> = {
    desktop: null,
    tablet: 768,
    mobile: 375,
};

const VIEWPORTS: { value: Viewport; icon: typeof Monitor; label: string }[] = [
    { value: "desktop", icon: Monitor, label: "Desktop" },
    { value: "tablet", icon: Tablet, label: "Tablet (768px)" },
    { value: "mobile", icon: Smartphone, label: "Mobile (375px)" },
];

function applyViewport(viewport: Viewport) {
    const container = document.querySelector<HTMLElement>('[data-slot="shell-container"]');
    if (!container) return;

    const width = VIEWPORT_WIDTHS[viewport];

    if (width === null) {
        // Desktop — remove all viewport constraints
        container.style.removeProperty("max-width");
        container.style.removeProperty("margin-left");
        container.style.removeProperty("margin-right");
        container.style.removeProperty("border-left");
        container.style.removeProperty("border-right");
        container.style.removeProperty("transition");
    } else {
        // Tablet or Mobile — constrain and center
        // container-type: inline-size is already set via @container class in CSS
        container.style.setProperty("max-width", `${width}px`, "important");
        container.style.setProperty("margin-left", "auto", "important");
        container.style.setProperty("margin-right", "auto", "important");
        container.style.setProperty("border-left", "1px dashed oklch(0.7 0 0 / 30%)");
        container.style.setProperty("border-right", "1px dashed oklch(0.7 0 0 / 30%)");
        container.style.setProperty("transition", "max-width 0.3s ease");
    }
}

export function ViewportSwitcher() {
    const [viewport, setViewport] = useState<Viewport>("desktop");

    const handleChange = useCallback((value: string) => {
        if (!value) return; // prevent deselection
        const v = value as Viewport;
        setViewport(v);
        applyViewport(v);
    }, []);

    if (process.env.NODE_ENV !== "development") {
        return null;
    }

    return (
        <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={viewport}
            onValueChange={handleChange}
            className="h-7"
        >
            {VIEWPORTS.map(({ value, icon: Icon, label }) => (
                <Tooltip key={value}>
                    <TooltipTrigger asChild>
                        <ToggleGroupItem
                            value={value}
                            className="size-7 p-0"
                        >
                            <Icon className="size-3.5" />
                        </ToggleGroupItem>
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                </Tooltip>
            ))}
        </ToggleGroup>
    );
}
