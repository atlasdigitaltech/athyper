"use client";

import { Badge } from "@/components/ui/badge";
import { KIND_BADGE } from "@/lib/semantic-colors";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<string, string> = {
    ref: "Reference",
    ent: "Enterprise",
    doc: "Document",
};

interface KindBadgeProps {
    kind: string;
    className?: string;
}

export function KindBadge({ kind, className }: KindBadgeProps) {
    const style = KIND_BADGE[kind.toLowerCase()] ?? "";
    const label = KIND_LABELS[kind.toLowerCase()] ?? kind;
    return (
        <Badge variant="outline" className={cn("text-xs font-normal", style, className)}>
            {label}
        </Badge>
    );
}
