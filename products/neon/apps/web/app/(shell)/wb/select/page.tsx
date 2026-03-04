"use client";

// /wb/select — Workbench selection page
// Shown when a user has multiple workbench roles and no default is resolved.

import { Command } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";


import type { SessionBootstrap } from "@/lib/session-bootstrap";

import { Button } from "@/components/ui/button";
import { isWorkbench, type Workbench } from "@/lib/auth/types";
import { getWorkbenchDefaultRoute, WORKBENCH_CONFIGS } from "@/lib/auth/workbench-config";


const LAST_WB_KEY = "neon_last_workbench";

export default function WorkbenchSelectPage() {
    const router = useRouter();
    const [workbenches, setWorkbenches] = useState<Workbench[]>([]);

    useEffect(() => {
        const bootstrap = (window as any).__SESSION_BOOTSTRAP__ as SessionBootstrap | undefined;
        if (!bootstrap) {
            router.replace("/login");
            return;
        }
        const allowed = (bootstrap.allowedWorkbenches ?? []).filter(isWorkbench);
        setWorkbenches(allowed);
    }, [router]);

    function selectWorkbench(wb: Workbench) {
        localStorage.setItem(LAST_WB_KEY, wb);
        router.push(getWorkbenchDefaultRoute(wb));
    }

    return (
        <div className="flex h-dvh items-center justify-center bg-background">
            <div className="w-full max-w-md space-y-8 p-8">
                <div className="space-y-2 text-center">
                    <div className="flex items-center justify-center gap-2">
                        <Command className="size-6" />
                        <span className="text-lg font-semibold">Neon</span>
                    </div>
                    <h2 className="text-xl font-medium">Select Workbench</h2>
                    <p className="text-sm text-muted-foreground">
                        You have access to multiple workbenches. Choose one to continue.
                    </p>
                </div>

                <div className="grid gap-3">
                    {workbenches.map((wb) => {
                        const config = WORKBENCH_CONFIGS[wb];
                        return (
                            <Button
                                key={wb}
                                variant="outline"
                                className="h-auto flex-col items-start p-4 text-left"
                                onClick={() => selectWorkbench(wb)}
                            >
                                <span className="text-sm font-medium">{config.label}</span>
                                <span className="text-xs text-muted-foreground">
                                    {config.description}
                                </span>
                            </Button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
