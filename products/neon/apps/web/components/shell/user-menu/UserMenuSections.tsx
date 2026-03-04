"use client";

// components/shell/user-menu/UserMenuSections.tsx
//
// Menu section components for the GlobalUserMenu.
// Each section receives the shared model and renders its items
// with capability-driven visibility from model.visibility.

import {
    Building2,
    Check,
    CreditCard,
    Globe,
    HeadphonesIcon,
    LogOut,
    Monitor,
    Moon,
    Palette,
    Settings,
    ShoppingBag,
    Smartphone,
    Sun,
    SunMoon,
    Tablet,
    UserCircle,
    Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";

import {
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useMessages } from "@/lib/i18n/messages-context";
import { THEME_PRESET_OPTIONS, type ThemePreset } from "@/lib/preferences/theme";
import { cn } from "@/lib/utils";
import {
    LOCALES,
    type UserMenuModel,
} from "@/lib/user-menu/use-user-menu-model";

// ─── Shared types ────────────────────────────────────────────────────────────

export interface SectionProps {
    model: UserMenuModel;
    workbench: string;
    variant: "dropdown" | "drawer";
}

type ExperienceSectionProps = Omit<SectionProps, "workbench">;

// ─── Theme mode config ───────────────────────────────────────────────────────

const THEME_MODES = [
    { value: "light" as const, icon: Sun, label: "Light" },
    { value: "dark" as const, icon: Moon, label: "Dark" },
    { value: "system" as const, icon: Monitor, label: "System" },
];

const VIEWPORTS = [
    { value: "desktop" as const, icon: Monitor, label: "Desktop" },
    { value: "tablet" as const, icon: Tablet, label: "Tablet (768px)" },
    { value: "mobile" as const, icon: Smartphone, label: "Mobile (375px)" },
];

// ─── Section 2: Tenant Management ────────────────────────────────────────────

export function TenantManagementSection({ model, workbench }: SectionProps) {
    const router = useRouter();
    const { t } = useMessages();
    const v = model.visibility;

    const hasAnyItem = v.tenantProfile || v.legalProfile || v.subscription || v.diagnostics;
    if (!hasAnyItem) return null;

    return (
        <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
                {v.tenantProfile && (
                    <DropdownMenuItem onClick={() => router.push(`/wb/${workbench}/settings/tenant`)}>
                        <UserCircle className="mr-2 size-4" />
                        {t("tenant.menu.tenantProfile", "Tenant Profile")}
                    </DropdownMenuItem>
                )}
                {v.legalProfile && (
                    <DropdownMenuItem onClick={() => router.push(`/wb/${workbench}/settings/company`)}>
                        <Building2 className="mr-2 size-4" />
                        {t("tenant.menu.legalProfile", "Company Profile")}
                    </DropdownMenuItem>
                )}
                {v.subscription && (
                    <DropdownMenuItem onClick={() => router.push(`/wb/${workbench}/settings/subscription`)}>
                        <CreditCard className="mr-2 size-4" />
                        {t("tenant.menu.subscription")}
                    </DropdownMenuItem>
                )}
                {v.diagnostics && (
                    <DropdownMenuItem onClick={() => router.push(`/wb/${workbench}/settings/debug`)}>
                        <Wrench className="mr-2 size-4" />
                        {t("common.user.diagnostics")}
                    </DropdownMenuItem>
                )}
            </DropdownMenuGroup>
        </>
    );
}

// ─── Section 3: Operational ──────────────────────────────────────────────────

export function OperationalSection({ model, workbench }: SectionProps) {
    const router = useRouter();
    const { t } = useMessages();
    const v = model.visibility;

    return (
        <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => router.push(`/wb/${workbench}/settings`)}>
                    <Settings className="mr-2 size-4" />
                    {t("tenant.menu.settings", "Settings")}
                </DropdownMenuItem>
                {v.savedSuppliers && (
                    <DropdownMenuItem onClick={() => router.push(`/wb/${workbench}/suppliers/saved`)}>
                        <ShoppingBag className="mr-2 size-4" />
                        {t("tenant.menu.savedSuppliers", "Saved Suppliers")}
                    </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => router.push(`/wb/${workbench}/support`)}>
                    <HeadphonesIcon className="mr-2 size-4" />
                    {t("tenant.menu.support", "Support")}
                </DropdownMenuItem>
            </DropdownMenuGroup>
        </>
    );
}

// ─── Section 4: Experience ───────────────────────────────────────────────────

export function ExperienceSection({ model }: ExperienceSectionProps) {
    const { t } = useMessages();
    const v = model.visibility;

    return (
        <>
            <DropdownMenuSeparator />
            {/* Language sub-menu */}
            <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                    <Globe className="mr-2 size-4" />
                    {t("common.header.language")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                    {LOCALES.map(({ code, label, native }) => (
                        <DropdownMenuItem
                            key={code}
                            onClick={() => model.handleLocaleChange(code)}
                        >
                            <span className="flex-1">
                                <span className="text-sm">{native}</span>
                                {native !== label && (
                                    <span className="ml-1.5 text-xs text-muted-foreground">
                                        {label}
                                    </span>
                                )}
                            </span>
                            {code === model.currentLocale && (
                                <Check className="size-3.5 text-primary" />
                            )}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuSubContent>
            </DropdownMenuSub>

            {/* Palette sub-menu */}
            <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                    <Palette className="mr-2 size-4" />
                    {t("common.header.palette")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                    {THEME_PRESET_OPTIONS.map((preset) => {
                        const isActive = model.themePreset === preset.value;
                        const colors =
                            (model.resolvedThemeMode ?? "light") === "dark"
                                ? preset.swatch.dark
                                : preset.swatch.light;
                        return (
                            <DropdownMenuItem
                                key={preset.value}
                                onClick={() => model.handlePresetChange(preset.value as ThemePreset)}
                            >
                                <span className="mr-2 inline-grid size-7 shrink-0 grid-cols-2 overflow-hidden rounded-lg">
                                    {colors.map((c, i) => (
                                        <span key={i} style={{ backgroundColor: c }} />
                                    ))}
                                </span>
                                <span className="flex-1 text-sm">{preset.label}</span>
                                {isActive && (
                                    <Check className="size-3.5 text-primary" />
                                )}
                            </DropdownMenuItem>
                        );
                    })}
                </DropdownMenuSubContent>
            </DropdownMenuSub>

            {/* Theme Mode toggle */}
            <div className="flex items-center justify-between px-2 py-1.5">
                <span className="flex items-center gap-2 text-sm">
                    <SunMoon className="size-4 text-muted-foreground" />
                    {t("common.header.theme")}
                </span>
                <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                    {THEME_MODES.map(({ value, icon: Icon, label }) => (
                        <button
                            key={value}
                            type="button"
                            aria-label={label}
                            title={label}
                            onClick={() => model.handleThemeChange(value)}
                            className={cn(
                                "inline-flex items-center justify-center rounded-md p-1.5 transition-all",
                                model.themeMode === value
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            <Icon className="size-3.5" />
                        </button>
                    ))}
                </div>
            </div>

            {/* Viewport toggle (dev/platform only) */}
            {v.viewport && (
                <>
                    <DropdownMenuSeparator />
                    <div className="flex items-center justify-between px-2 py-1.5">
                        <span className="flex items-center gap-2 text-sm">
                            <Monitor className="size-4 text-muted-foreground" />
                            Viewport
                        </span>
                        <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                            {VIEWPORTS.map(({ value, icon: Icon, label }) => (
                                <button
                                    key={value}
                                    type="button"
                                    aria-label={label}
                                    title={label}
                                    onClick={() => model.setViewport(value)}
                                    className={cn(
                                        "inline-flex items-center justify-center rounded-md p-1.5 transition-all",
                                        model.viewport === value
                                            ? "bg-background text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    <Icon className="size-3.5" />
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </>
    );
}

// ─── Section 5: Logout ───────────────────────────────────────────────────────

export function LogoutSection({ model }: { model: UserMenuModel; variant: "dropdown" | "drawer" }) {
    const { t } = useMessages();

    return (
        <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={model.handleLogout}>
                <LogOut className="mr-2 size-4" />
                {t("common.user.logout")}
            </DropdownMenuItem>
        </>
    );
}
