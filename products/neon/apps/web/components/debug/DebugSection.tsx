"use client";

// components/debug/DebugSection.tsx
//
// Reusable key-value row helper for the Session Debug Console.

interface DebugRowProps {
    label: string;
    value: React.ReactNode;
    mono?: boolean;
}

export function DebugRow({ label, value, mono }: DebugRowProps) {
    return (
        <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
            <span className="text-muted-foreground shrink-0">{label}</span>
            <span className={`min-w-0 text-right ${mono ? "font-mono text-xs break-all" : ""}`}>
                {value ?? <span className="text-muted-foreground italic">—</span>}
            </span>
        </div>
    );
}

interface DebugSectionProps {
    title: string;
    children: React.ReactNode;
}

export function DebugSection({ title, children }: DebugSectionProps) {
    return (
        <div className="space-y-1">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {title}
            </h3>
            <div className="divide-y">{children}</div>
        </div>
    );
}
