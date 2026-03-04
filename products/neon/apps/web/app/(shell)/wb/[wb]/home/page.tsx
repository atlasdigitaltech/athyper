import {
    BarChart3,
    BookOpen,
    FileText,
    GitBranch,
    Handshake,
    LayoutDashboard,
    MessageSquare,
    Package,
    Plug,
    ScrollText,
    Settings,
    Shapes,
    Shield,
} from "lucide-react";
import Link from "next/link";

import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";


interface HomePageProps {
    params: Promise<{ wb: string }>;
}

// ─── Admin mesh cards ─────────────────────────────────────────────────────────

interface NavCard {
    title: string;
    description: string;
    icon: LucideIcon;
    href: string;
}

const MESH_STUDIO_CARDS: NavCard[] = [
    {
        title: "Meta Studio",
        description: "Design entities, fields, relations, and lifecycle rules.",
        icon: Shapes,
        href: "/wb/admin/mesh/meta-studio",
    },
    {
        title: "Workflow Studio",
        description: "Build approval flows and state machine automations.",
        icon: GitBranch,
        href: "/wb/admin/mesh/workflow-studio",
    },
    {
        title: "Policy Studio",
        description: "Manage access control policies and permission rules.",
        icon: Shield,
        href: "/wb/admin/mesh/policy-studio",
    },
    {
        title: "Integration Studio",
        description: "Configure webhooks, connectors, and external integrations.",
        icon: Plug,
        href: "/wb/admin/mesh/integration-studio",
    },
    {
        title: "Governance",
        description: "Audit trails, compliance reports, and data governance.",
        icon: ScrollText,
        href: "/wb/admin/mesh/governance",
    },
    {
        title: "Marketplace",
        description: "Browse and install pre-built modules and templates.",
        icon: Package,
        href: "/wb/admin/mesh/marketplace",
    },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WorkbenchHomePage({ params }: HomePageProps) {
    const { wb } = await params;

    if (wb === "admin") {
        return <AdminHome />;
    }

    if (wb === "partner") {
        return <PartnerHome wb={wb} />;
    }

    return <UserHome wb={wb} />;
}

// ─── Admin Home ───────────────────────────────────────────────────────────────

function AdminHome() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Administration</h1>
                <p className="text-sm text-muted-foreground">
                    Design-time studios and infrastructure operations.
                </p>
            </div>

            <Separator />

            {/* Mesh Administration */}
            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-medium">Mesh Administration</h2>
                        <p className="text-xs text-muted-foreground">
                            Design entities, automate workflows, and govern your data platform.
                        </p>
                    </div>
                    <Link
                        href="/wb/admin/mesh"
                        className="text-xs font-medium text-primary hover:underline"
                    >
                        View all →
                    </Link>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {MESH_STUDIO_CARDS.map((card) => (
                        <MeshCard key={card.href} card={card} />
                    ))}
                </div>
            </section>

            <Separator />

            {/* General admin */}
            <section className="space-y-4">
                <h2 className="text-base font-medium">General</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <MeshCard
                        card={{
                            title: "Dashboard",
                            description: "Analytics, reports, and system metrics.",
                            icon: LayoutDashboard,
                            href: "/wb/admin/dashboards",
                        }}
                    />
                    <MeshCard
                        card={{
                            title: "Settings",
                            description: "Workbench settings and configuration.",
                            icon: Settings,
                            href: "/wb/admin/settings",
                        }}
                    />
                </div>
            </section>
        </div>
    );
}

function MeshCard({ card }: { card: NavCard }) {
    return (
        <Link href={card.href} className="group block">
            <Card className="h-full transition-colors group-hover:bg-accent/50">
                <CardHeader className="gap-3">
                    <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <card.icon className="size-5" />
                    </div>
                    <div>
                        <CardTitle className="text-sm">{card.title}</CardTitle>
                        <CardDescription className="text-xs">{card.description}</CardDescription>
                    </div>
                </CardHeader>
            </Card>
        </Link>
    );
}

// ─── User Home ────────────────────────────────────────────────────────────────

function UserHome({ wb }: { wb: string }) {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">User Workbench</h1>
                <p className="text-sm text-muted-foreground">
                    Your personal workspace for data, tasks, and reports.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border bg-card p-6">
                    <div className="space-y-4">
                        <Badge variant="outline" className="text-xs">Quick Actions</Badge>
                        <nav className="space-y-2">
                            <QuickLink
                                href={`/wb/${wb}/dashboards`}
                                icon={<BarChart3 className="size-4 text-blue-600" />}
                                label="Dashboards"
                                description="Analytics and reports"
                            />
                            <QuickLink
                                href={`/wb/${wb}/dashboards/messaging`}
                                icon={<MessageSquare className="size-4 text-indigo-600" />}
                                label="Messaging Analytics"
                                description="Conversation metrics and trends"
                            />
                            <QuickLink
                                href="/app/account/view/list"
                                icon={<BookOpen className="size-4 text-emerald-600" />}
                                label="Accounts"
                                description="Chart of Accounts (Master)"
                            />
                            <QuickLink
                                href="/app/purchase-invoice/view/list"
                                icon={<FileText className="size-4 text-amber-600" />}
                                label="Purchase Invoices"
                                description="Supplier invoices (Document)"
                            />
                        </nav>
                    </div>
                </div>
                <div className="rounded-lg border bg-card p-6">
                    <div className="space-y-2">
                        <Badge variant="outline" className="text-xs">Recent Activity</Badge>
                        <p className="text-sm text-muted-foreground">
                            Recent activity and notifications will appear here.
                        </p>
                    </div>
                </div>
                <div className="rounded-lg border bg-card p-6">
                    <div className="space-y-2">
                        <Badge variant="outline" className="text-xs">Favorites</Badge>
                        <p className="text-sm text-muted-foreground">
                            Pinned items and favorites will appear here.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Partner Home ─────────────────────────────────────────────────────────────

function PartnerHome({ wb }: { wb: string }) {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Partner Workbench</h1>
                <p className="text-sm text-muted-foreground">
                    Collaboration and partner-facing operations.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border bg-card p-6">
                    <div className="space-y-4">
                        <Badge variant="outline" className="text-xs">Quick Actions</Badge>
                        <nav className="space-y-2">
                            <QuickLink
                                href={`/wb/${wb}/dashboards`}
                                icon={<BarChart3 className="size-4 text-blue-600" />}
                                label="Dashboards"
                                description="Analytics and reports"
                            />
                            <QuickLink
                                href="/app/contact/view/list"
                                icon={<Handshake className="size-4 text-emerald-600" />}
                                label="Contacts"
                                description="Partner contacts and leads"
                            />
                        </nav>
                    </div>
                </div>
                <div className="rounded-lg border bg-card p-6">
                    <div className="space-y-2">
                        <Badge variant="outline" className="text-xs">Recent Activity</Badge>
                        <p className="text-sm text-muted-foreground">
                            Recent activity and notifications will appear here.
                        </p>
                    </div>
                </div>
                <div className="rounded-lg border bg-card p-6">
                    <div className="space-y-2">
                        <Badge variant="outline" className="text-xs">Favorites</Badge>
                        <p className="text-sm text-muted-foreground">
                            Pinned items and favorites will appear here.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function QuickLink({
    href,
    icon,
    label,
    description,
}: {
    href: string;
    icon: React.ReactNode;
    label: string;
    description: string;
}) {
    return (
        <Link
            href={href}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent"
        >
            {icon}
            <div>
                <div className="font-medium">{label}</div>
                <div className="text-xs text-muted-foreground">{description}</div>
            </div>
        </Link>
    );
}
