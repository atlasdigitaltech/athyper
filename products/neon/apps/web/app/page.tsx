import { Command, Shield, Handshake, User, Settings } from "lucide-react";
import Link from "next/link";

const LOGIN_OPTIONS = [
    {
        id: "user",
        label: "User",
        description: "Standard user workbench for day-to-day operations",
        href: "/user_login",
        icon: User,
        bg: "#2563eb",
        bgHover: "#1d4ed8",
    },
    {
        id: "admin",
        label: "Admin",
        description: "System administration and configuration",
        href: "/admin_login",
        icon: Shield,
        bg: "#059669",
        bgHover: "#047857",
    },
    {
        id: "partner",
        label: "Partner",
        description: "Partner collaboration and external access",
        href: "/partner_login",
        icon: Handshake,
        bg: "#7c3aed",
        bgHover: "#6d28d9",
    },
    {
        id: "ops",
        label: "OPS Admin",
        description: "Platform operations — select tenant, then workbench",
        href: "/ops_login",
        icon: Settings,
        bg: "#d97706",
        bgHover: "#b45309",
    },
] as const;

export default function HomePage() {
    return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-background p-8">
            <div className="w-full max-w-3xl space-y-8">
                {/* Header */}
                <div className="space-y-2 text-center">
                    <div className="flex items-center justify-center gap-2">
                        <Command className="size-8" />
                        <span className="text-2xl font-semibold">Neon</span>
                    </div>
                    <p className="text-muted-foreground">
                        Choose how you want to sign in
                    </p>
                </div>

                {/* Login option cards */}
                <div className="grid gap-4 sm:grid-cols-2">
                    {LOGIN_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        return (
                            <Link
                                key={option.id}
                                href={option.href}
                                className="group flex flex-col rounded-lg border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md"
                            >
                                <div className="flex items-center gap-3 mb-3">
                                    <div
                                        className="flex size-10 items-center justify-center rounded-lg transition-colors"
                                        style={{ backgroundColor: option.bg, color: "#fff" }}
                                    >
                                        <Icon className="size-5" />
                                    </div>
                                    <h2 className="text-lg font-semibold">{option.label}</h2>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {option.description}
                                </p>
                            </Link>
                        );
                    })}
                </div>

                {/* Footer */}
                <p className="text-center text-xs text-muted-foreground">
                    &copy; {new Date().getFullYear()} athyper. All rights reserved.
                </p>
            </div>
        </div>
    );
}
