"use client";

import { StatusDot } from "./StatusDot";

import { Badge } from "@/components/ui/badge";


interface VersionBadgeProps {
    version: number;
    status: string;
}

export function VersionBadge({ version, status }: VersionBadgeProps) {
    return (
        <Badge variant="outline" className="gap-1.5 text-xs font-normal">
            <StatusDot status={status} />
            v{version} · {status}
        </Badge>
    );
}
