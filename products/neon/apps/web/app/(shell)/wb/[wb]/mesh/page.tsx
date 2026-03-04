"use client";

import {
    ArrowRight, GitBranch, ListTodo, Shapes, Shield,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";


/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

interface AppCard {
    title: string;
    description: string;
    icon: LucideIcon;
    href: string;
    accent: string;          // tailwind text color for icon
    accentBg: string;        // tailwind bg for icon container
    accentBorder: string;    // tailwind border-l color
    accentGlow: string;      // tailwind ring/shadow on hover
}

interface AppSection {
    label: string;
    tagline: string;
    apps: AppCard[];
}

const SECTIONS: AppSection[] = [
    {
        label: "Designer Studio",
        tagline: "Model, configure, and govern your platform entities",
        apps: [
            {
                title: "Schema Designer",
                description:
                    "Define entity schemas, fields, relations, validation rules, and manage version history.",
                icon: Shapes,
                href: "/meta-studio",
                accent: "text-blue-600 dark:text-blue-400",
                accentBg: "bg-blue-50 dark:bg-blue-950/40",
                accentBorder: "border-l-blue-500",
                accentGlow: "hover:shadow-blue-500/10 hover:ring-blue-500/20",
            },
            {
                title: "Lifecycle Designer",
                description:
                    "Build state machines with transitions, gates, approval workflows, and SLA timers.",
                icon: GitBranch,
                href: "/workflow-studio",
                accent: "text-violet-600 dark:text-violet-400",
                accentBg: "bg-violet-50 dark:bg-violet-950/40",
                accentBorder: "border-l-violet-500",
                accentGlow: "hover:shadow-violet-500/10 hover:ring-violet-500/20",
            },
            {
                title: "Policy Editor",
                description:
                    "Author ABAC policies, define rules with conditions, scopes, and conflict resolution strategies.",
                icon: Shield,
                href: "/policy-studio",
                accent: "text-amber-600 dark:text-amber-400",
                accentBg: "bg-amber-50 dark:bg-amber-950/40",
                accentBorder: "border-l-amber-500",
                accentGlow: "hover:shadow-amber-500/10 hover:ring-amber-500/20",
            },
        ],
    },
    {
        label: "Monitoring",
        tagline: "Observe and operate background platform processes",
        apps: [
            {
                title: "Job Monitoring",
                description:
                    "Track background job queues, inspect job status, retry failures, and trigger manual runs.",
                icon: ListTodo,
                href: "/ops/jobs",
                accent: "text-emerald-600 dark:text-emerald-400",
                accentBg: "bg-emerald-50 dark:bg-emerald-950/40",
                accentBorder: "border-l-emerald-500",
                accentGlow: "hover:shadow-emerald-500/10 hover:ring-emerald-500/20",
            },
        ],
    },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function MeshDashboardPage() {
    const { wb } = useParams<{ wb: string }>();
    const basePath = `/wb/${wb}/mesh`;

    return (
        <div className="space-y-10">
            {/* ── Hero ──────────────────────────────────────────── */}
            <section className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-muted/50 via-background to-muted/30 px-6 py-8">
                {/* Decorative dots */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-[0.03] [background-image:radial-gradient(circle,currentColor_1px,transparent_1px)] [background-size:24px_24px]"
                />

                <div className="relative">
                    <h2 className="text-xl font-semibold tracking-tight">
                        Admin Workbench
                    </h2>
                    <p className="mt-1 max-w-lg text-sm text-muted-foreground leading-relaxed">
                        Design schemas, lifecycles, and access policies — then monitor
                        the jobs that keep it all running.
                    </p>
                </div>
            </section>

            {/* ── Sections ──────────────────────────────────────── */}
            {SECTIONS.map((section) => (
                <section key={section.label} className="space-y-4">
                    {/* Section header */}
                    <div className="flex items-baseline gap-3">
                        <h3 className="text-base font-semibold tracking-tight">
                            {section.label}
                        </h3>
                        <span className="text-xs text-muted-foreground">
                            {section.tagline}
                        </span>
                    </div>

                    {/* Cards grid — 3 cols for designers, adapts for fewer */}
                    <div
                        className={
                            section.apps.length >= 3
                                ? "grid gap-4 md:grid-cols-2 lg:grid-cols-3"
                                : "grid gap-4 md:grid-cols-2 lg:max-w-md"
                        }
                    >
                        {section.apps.map((app) => (
                            <Link key={app.href} href={`${basePath}${app.href}`}>
                                <Card
                                    className={[
                                        "group relative h-full border-l-4 transition-all",
                                        "hover:shadow-lg hover:ring-1",
                                        app.accentBorder,
                                        app.accentGlow,
                                    ].join(" ")}
                                >
                                    <CardContent className="flex flex-col gap-4 p-5">
                                        {/* Icon + arrow row */}
                                        <div className="flex items-start justify-between">
                                            <div
                                                className={[
                                                    "flex size-10 items-center justify-center rounded-lg transition-colors",
                                                    app.accentBg,
                                                ].join(" ")}
                                            >
                                                <app.icon
                                                    className={`size-5 ${app.accent}`}
                                                />
                                            </div>
                                            <ArrowRight className="size-4 text-muted-foreground/40 transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
                                        </div>

                                        {/* Text */}
                                        <div>
                                            <h4 className="text-sm font-semibold leading-none">
                                                {app.title}
                                            </h4>
                                            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                                                {app.description}
                                            </p>
                                        </div>

                                        {/* Active indicator */}
                                        <div className="flex items-center gap-1.5">
                                            <span className="relative flex size-2">
                                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                                            </span>
                                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                                Active
                                            </span>
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}
