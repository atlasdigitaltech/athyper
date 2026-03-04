"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

interface BackLinkProps {
    href: string;
    label: string;
}

export function BackLink({ href, label }: BackLinkProps) {
    return (
        <Link
            href={href}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
            <ArrowLeft className="size-3.5" />
            {label}
        </Link>
    );
}
