"use client";

import {
    ChevronDown,
    Handshake,
    Settings,
    Shield,
    User,
} from "lucide-react";
import { useRouter } from "next/navigation";

import type { Workbench } from "@/lib/auth/types";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthOptional } from "@/lib/auth/auth-context";
import { setLastWorkbench } from "@/lib/auth/context-resolver";
import { WORKBENCH_CONFIGS } from "@/lib/auth/workbench-config";



const ICON_MAP: Record<string, typeof Shield> = {
    User,
    Handshake,
    Shield,
    Settings,
};

export function WorkbenchSwitcher() {
    const auth = useAuthOptional();
    const router = useRouter();

    if (!auth) return null;

    const current = WORKBENCH_CONFIGS[auth.activeWorkbench];
    const CurrentIcon = ICON_MAP[current.icon] ?? Shield;

    function handleSwitch(wb: Workbench) {
        if (wb === auth!.activeWorkbench) return;
        setLastWorkbench(wb);
        const target = WORKBENCH_CONFIGS[wb].defaultRoute;
        router.push(target);
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5">
                    <CurrentIcon className="size-4" />
                    <span className="hidden @3xl:inline">{current.label} Workbench</span>
                    <ChevronDown className="size-3 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
                {auth.allowedWorkbenches.map((wb) => {
                    const config = WORKBENCH_CONFIGS[wb];
                    const Icon = ICON_MAP[config.icon] ?? Shield;
                    const isActive = wb === auth.activeWorkbench;

                    return (
                        <DropdownMenuItem
                            key={wb}
                            onClick={() => handleSwitch(wb)}
                            className={isActive ? "bg-accent" : ""}
                        >
                            <Icon className="mr-2 size-4" />
                            <div className="flex flex-col">
                                <span className="text-sm font-medium">{config.label}</span>
                                <span className="text-xs text-muted-foreground">
                                    {config.description}
                                </span>
                            </div>
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
