"use client";

// components/tenant-profile/shared.tsx
//
// Reusable sub-components for the Tenant Profile page.
// FieldRow, CopyButton, PlaceholderBadge, StatusBadge, SectionCard.

import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMessages } from "@/lib/i18n/messages-context";

// ─── CopyButton ──────────────────────────────────────────────────────────────

interface CopyButtonProps {
    value: string;
}

export function CopyButton({ value }: CopyButtonProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }, [value]);

    return (
        <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0"
            onClick={handleCopy}
        >
            {copied
                ? <Check className="size-3 text-green-500" />
                : <Copy className="size-3 text-muted-foreground" />
            }
        </Button>
    );
}

// ─── FieldRow ────────────────────────────────────────────────────────────────

interface FieldRowProps {
    label: string;
    value: React.ReactNode;
    mono?: boolean;
    copyable?: boolean;
}

export function FieldRow({ label, value, mono, copyable }: FieldRowProps) {
    return (
        <div className="flex items-start justify-between gap-4 py-2 text-sm">
            <span className="shrink-0 text-muted-foreground">{label}</span>
            <span className={`flex min-w-0 items-center gap-1.5 text-right ${mono ? "font-mono text-xs break-all" : ""}`}>
                {value ?? <span className="italic text-muted-foreground">—</span>}
                {copyable && typeof value === "string" && <CopyButton value={value} />}
            </span>
        </div>
    );
}

// ─── PlaceholderBadge ────────────────────────────────────────────────────────

export function PlaceholderBadge() {
    const { t } = useMessages();
    return (
        <Badge variant="outline" className="text-xs text-muted-foreground/60">
            {t("tenant.profile.notAvailable", "Not available yet")}
        </Badge>
    );
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

const ENV_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    production: "default",
    staging: "secondary",
    development: "outline",
    local: "outline",
};

interface StatusBadgeProps {
    value: string;
    variant?: "environment" | "status";
}

export function StatusBadge({ value, variant = "environment" }: StatusBadgeProps) {
    const badgeVariant = variant === "environment"
        ? (ENV_VARIANTS[value] ?? "outline")
        : "default";

    return (
        <Badge variant={badgeVariant} className="text-xs capitalize">
            {value}
        </Badge>
    );
}

// ─── SectionCard ─────────────────────────────────────────────────────────────

interface SectionCardProps {
    title: string;
    description?: string;
    children: React.ReactNode;
}

export function SectionCard({ title, description, children }: SectionCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
                {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent>
                <div className="divide-y">
                    {children}
                </div>
            </CardContent>
        </Card>
    );
}
