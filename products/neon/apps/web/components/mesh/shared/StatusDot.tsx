"use client";

import { STATUS_DOT } from "@/lib/semantic-colors";
import { cn } from "@/lib/utils";

interface StatusDotProps {
    status: string;
    className?: string;
}

export function StatusDot({ status, className }: StatusDotProps) {
    const color = STATUS_DOT[status.toLowerCase()] ?? "bg-muted-foreground/40";
    return (
        <span
            className={cn("inline-block size-2 rounded-full", color, className)}
            aria-label={status}
        />
    );
}
