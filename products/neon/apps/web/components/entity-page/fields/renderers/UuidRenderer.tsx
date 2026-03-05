"use client";

import { Label } from "@neon/ui";
import { Copy } from "lucide-react";
import type { ResolvedFieldMeta } from "@/lib/entity-page/resolve-field-meta";

interface UuidRendererProps {
    resolved: ResolvedFieldMeta;
    value: unknown;
}

/**
 * UUID view renderer — monospace + copy icon.
 * Designed for admin usability: readable, copyable.
 */
export function UuidViewRenderer({ resolved, value }: UuidRendererProps) {
    const { displayLabel } = resolved;
    const strValue = value != null ? String(value) : null;

    return (
        <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">{displayLabel}</Label>
            <div className="flex items-center gap-1 min-h-[1.5rem]">
                {strValue ? (
                    <>
                        <code className="text-xs font-mono text-muted-foreground truncate">
                            {strValue}
                        </code>
                        <button
                            type="button"
                            className="inline-flex items-center text-muted-foreground/60 hover:text-foreground transition-colors"
                            title="Copy to clipboard"
                            onClick={() => navigator.clipboard.writeText(strValue)}
                        >
                            <Copy className="size-3" />
                        </button>
                    </>
                ) : (
                    <span className="text-sm">{"\u2014"}</span>
                )}
            </div>
        </div>
    );
}
