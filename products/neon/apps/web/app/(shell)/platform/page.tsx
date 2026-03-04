"use client";

import { useEffect, useState } from "react";

import { TenantSelector } from "@athyper/ui/platform/TenantSelector";

const WORKBENCH_OPTIONS = [
    {
        id: "user",
        label: "User Workbench",
        description: "Standard user operations for the selected tenant",
        href: "/wb/user/home",
        bg: "#2563eb",
    },
    {
        id: "admin",
        label: "Admin Workbench",
        description: "System administration for the selected tenant",
        href: "/wb/admin/home",
        bg: "#059669",
    },
    {
        id: "partner",
        label: "Partner Workbench",
        description: "Partner collaboration view for the selected tenant",
        href: "/wb/partner/home",
        bg: "#7c3aed",
    },
] as const;

/**
 * Platform Admin Landing Page
 *
 * Shown after platform admin login. Two-step flow:
 *   1. Select a tenant from the list
 *   2. Choose which workbench (user / admin / partner) to operate in
 */
export default function PlatformPage() {
    const [bootstrap, setBootstrap] = useState<{
        isPlatformAdmin: boolean;
        selectedTenantId: string | null;
        csrfToken: string;
        platformRoles: string[];
    } | null>(null);

    useEffect(() => {
        const win = window as any;
        if (win.__SESSION_BOOTSTRAP__) {
            setBootstrap({
                isPlatformAdmin: win.__SESSION_BOOTSTRAP__.isPlatformAdmin ?? false,
                selectedTenantId: win.__SESSION_BOOTSTRAP__.selectedTenantId ?? null,
                csrfToken: win.__SESSION_BOOTSTRAP__.csrfToken ?? "",
                platformRoles: win.__SESSION_BOOTSTRAP__.platformRoles ?? [],
            });
        }
    }, []);

    if (!bootstrap) {
        return <div className="p-8 text-gray-500">Loading...</div>;
    }

    if (!bootstrap.isPlatformAdmin) {
        return (
            <div className="p-8">
                <h1 className="text-xl font-semibold mb-2">Access Denied</h1>
                <p className="text-gray-500">This page is only accessible to platform administrators.</p>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto mt-8 px-4">
            <div className="mb-6">
                <h1 className="text-2xl font-semibold">Platform Control</h1>
                <p className="text-gray-500 mt-1">
                    Select a tenant, then choose a workbench to operate in. All access is read-only.
                </p>
            </div>

            {/* Step 1: Tenant Selection */}
            <div className="mb-6">
                <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
                    Step 1 — Select Tenant
                </h2>
                <div className="rounded-lg border bg-white shadow-sm">
                    <TenantSelector
                        currentTenantId={bootstrap.selectedTenantId}
                        csrfToken={bootstrap.csrfToken}
                        onSwitch={() => {
                            // The TenantSelector will reload the page after a successful switch
                        }}
                    />
                </div>
            </div>

            {/* Step 2: Workbench Selection (only shown after tenant is selected) */}
            {bootstrap.selectedTenantId && (
                <div>
                    <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
                        Step 2 — Choose Workbench
                    </h2>
                    <div className="rounded-lg border bg-white shadow-sm p-4">
                        <p className="text-sm text-gray-600 mb-4">
                            Viewing tenant: <strong>{bootstrap.selectedTenantId}</strong>
                        </p>
                        <div className="grid gap-3 sm:grid-cols-3">
                            {WORKBENCH_OPTIONS.map((wb) => (
                                <a
                                    key={wb.id}
                                    href={wb.href}
                                    className="flex flex-col items-center rounded-lg px-4 py-4 text-center transition-opacity hover:opacity-90"
                                    style={{ backgroundColor: wb.bg, color: "#fff" }}
                                >
                                    <span className="text-sm font-medium">{wb.label}</span>
                                    <span className="text-xs mt-1" style={{ opacity: 0.8 }}>{wb.description}</span>
                                </a>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Sign out link */}
            <div className="mt-6 text-center">
                <a
                    href="/logout"
                    className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                    Sign out of Platform Control
                </a>
            </div>
        </div>
    );
}
