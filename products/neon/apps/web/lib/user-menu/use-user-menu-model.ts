// lib/user-menu/use-user-menu-model.ts
//
// Composed model hook for the GlobalUserMenu.
// Shared between the header dropdown (UserMenu.tsx) and the drawer footer (GlobalDrawer.tsx).
//
// Internally split into focused sub-hooks to avoid a single mega-hook:
//   useBootstrap()      — reads window.__SESSION_BOOTSTRAP__
//   useIdentity()       — derives display name, initials, avatar color, roles
//   useMenuVisibility() — computes capability-driven section visibility
//   useMenuHandlers()   — theme, locale, logout, viewport handlers (all useCallback'd)

import { useCallback, useEffect, useMemo, useState } from "react";

import type { SessionBootstrap } from "@/lib/session-bootstrap";

import { applyFont } from "@/lib/preferences/layout-utils";
import { persistPreference } from "@/lib/preferences/preferences-storage";
import { THEME_PRESET_OPTIONS, type ThemeMode, type ThemePreset } from "@/lib/preferences/theme";
import type { ResolvedThemeMode } from "@/lib/preferences/theme";
import { applyThemePreset } from "@/lib/preferences/theme-utils";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { avatarColorFromUserId, AVATAR_FALLBACK, type AvatarColor } from "./avatar-color";
import { computeVisibility, type MenuVisibilityResult } from "./visibility";

// ─── Constants ───────────────────────────────────────────────────────────────

const NAME_MAX_LENGTH = 28;

export const LOCALES = [
    { code: "en", label: "English", native: "English" },
    { code: "ms", label: "Malay", native: "Bahasa Melayu" },
    { code: "ta", label: "Tamil", native: "தமிழ்" },
    { code: "hi", label: "Hindi", native: "हिन्दी" },
    { code: "ar", label: "Arabic", native: "العربية" },
    { code: "fr", label: "French", native: "Français" },
    { code: "de", label: "German", native: "Deutsch" },
] as const;

export type Viewport = "desktop" | "tablet" | "mobile";

export const VIEWPORT_WIDTHS: Record<Viewport, number | null> = {
    desktop: null,
    tablet: 768,
    mobile: 375,
};

// ─── Model type ──────────────────────────────────────────────────────────────

export interface UserMenuModel {
    // Identity
    displayName: string;
    truncatedName: string;
    initials: string;
    persona: string;
    additionalRoles: string[];
    avatarColor: AvatarColor;

    // Context
    userId: string;
    tenantId: string;
    tenantDisplayName: string;
    currentLocale: string;
    csrfToken: string;
    isPlatformAdmin: boolean;
    selectedTenantId: string | null;
    subscriptionTier: string;
    environment: string;
    featureFlags: Record<string, boolean>;

    // Visibility (precomputed)
    visibility: MenuVisibilityResult;

    // Handlers (all useCallback'd)
    handleThemeChange: (mode: ThemeMode) => void;
    handlePresetChange: (preset: ThemePreset) => void;
    handleLocaleChange: (code: string) => void;
    handleLogout: () => Promise<void>;

    // Theme state (from preferences store)
    themeMode: ThemeMode;
    themePreset: ThemePreset;
    resolvedThemeMode: ResolvedThemeMode;

    // Viewport (dev)
    viewport: Viewport;
    setViewport: (vp: Viewport) => void;

    // Hydration
    ready: boolean;
}

// ─── Sub-hooks ───────────────────────────────────────────────────────────────

function useBootstrap(): SessionBootstrap | null {
    const [bootstrap, setBootstrap] = useState<SessionBootstrap | null>(null);

    useEffect(() => {
        const bs = (window as unknown as Record<string, unknown>)
            .__SESSION_BOOTSTRAP__ as SessionBootstrap | undefined;
        if (bs) setBootstrap(bs);
    }, []);

    return bootstrap;
}

function getInitials(name: string): string {
    return name
        .split(" ")
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase();
}

function truncateName(name: string): string {
    if (name.length <= NAME_MAX_LENGTH) return name;
    return name.slice(0, NAME_MAX_LENGTH) + "\u2026";
}

interface IdentityResult {
    displayName: string;
    truncatedName: string;
    initials: string;
    persona: string;
    additionalRoles: string[];
    avatarColor: AvatarColor;
}

function useIdentity(bootstrap: SessionBootstrap | null): IdentityResult {
    return useMemo(() => {
        const displayName = bootstrap?.displayName ?? "User";
        const persona = bootstrap?.persona ?? "viewer";
        const userId = bootstrap?.userId ?? "";
        const roles = bootstrap?.roles ?? [];

        // Additional roles beyond the primary persona
        const additionalRoles = roles.filter(
            (r) => r !== persona && !r.startsWith("neon:") && !r.startsWith("default-roles-"),
        );

        // Format persona for display: "tenant_admin" → "Tenant Admin"
        const personaDisplay = persona.replace(/_/g, " ");

        return {
            displayName,
            truncatedName: truncateName(displayName),
            initials: getInitials(displayName),
            persona: personaDisplay,
            additionalRoles,
            avatarColor: userId ? avatarColorFromUserId(userId) : AVATAR_FALLBACK,
        };
    }, [bootstrap?.displayName, bootstrap?.persona, bootstrap?.userId, bootstrap?.roles]);
}

function useMenuVisibility(bootstrap: SessionBootstrap | null): MenuVisibilityResult {
    return useMemo(() => {
        if (!bootstrap) {
            return {
                tenantProfile: false,
                legalProfile: false,
                subscription: false,
                switchTenant: false,
                diagnostics: false,
                savedSuppliers: false,
                viewport: false,
            };
        }

        return computeVisibility({
            personas: bootstrap.personas ?? [],
            isPlatformAdmin: bootstrap.isPlatformAdmin ?? false,
            platformRoles: bootstrap.platformRoles ?? [],
            featureFlags: bootstrap.featureFlags ?? {},
            modules: bootstrap.modules ?? [],
            environment: bootstrap.environment ?? "local",
        });
    }, [bootstrap]);
}

export function applyViewport(viewport: Viewport) {
    const container = document.querySelector<HTMLElement>('[data-slot="shell-container"]');
    if (!container) return;
    const width = VIEWPORT_WIDTHS[viewport];
    if (width === null) {
        container.style.removeProperty("max-width");
        container.style.removeProperty("margin-left");
        container.style.removeProperty("margin-right");
        container.style.removeProperty("border-left");
        container.style.removeProperty("border-right");
        container.style.removeProperty("transition");
    } else {
        container.style.setProperty("max-width", `${width}px`, "important");
        container.style.setProperty("margin-left", "auto", "important");
        container.style.setProperty("margin-right", "auto", "important");
        container.style.setProperty("border-left", "1px dashed oklch(0.7 0 0 / 30%)");
        container.style.setProperty("border-right", "1px dashed oklch(0.7 0 0 / 30%)");
        container.style.setProperty("transition", "max-width 0.3s ease");
    }
}

interface HandlersResult {
    handleThemeChange: (mode: ThemeMode) => void;
    handlePresetChange: (preset: ThemePreset) => void;
    handleLocaleChange: (code: string) => void;
    handleLogout: () => Promise<void>;
    viewport: Viewport;
    setViewport: (vp: Viewport) => void;
    themeMode: ThemeMode;
    themePreset: ThemePreset;
    resolvedThemeMode: ResolvedThemeMode;
}

function useMenuHandlers(bootstrap: SessionBootstrap | null): HandlersResult {
    const themeMode = usePreferencesStore((s) => s.themeMode);
    const setThemeMode = usePreferencesStore((s) => s.setThemeMode);
    const resolvedThemeMode = usePreferencesStore((s) => s.resolvedThemeMode);
    const themePreset = usePreferencesStore((s) => s.themePreset);
    const setThemePreset = usePreferencesStore((s) => s.setThemePreset);
    const setFont = usePreferencesStore((s) => s.setFont);
    const [viewport, setViewportState] = useState<Viewport>("desktop");

    const currentLocale = bootstrap?.locale ?? "en";
    const csrfToken = bootstrap?.csrfToken ?? "";

    const handleThemeChange = useCallback(
        (mode: ThemeMode) => {
            setThemeMode(mode);
            persistPreference("theme_mode", mode);
        },
        [setThemeMode],
    );

    const handlePresetChange = useCallback(
        (preset: ThemePreset) => {
            applyThemePreset(preset);
            setThemePreset(preset);
            persistPreference("theme_preset", preset);

            const presetFont = THEME_PRESET_OPTIONS.find((p) => p.value === preset)?.font;
            if (presetFont) {
                applyFont(presetFont);
                setFont(presetFont);
                persistPreference("font", presetFont);
            }
        },
        [setThemePreset, setFont],
    );

    const handleLocaleChange = useCallback(
        (code: string) => {
            if (code === currentLocale) return;
            document.cookie = `neon_locale=${code}; path=/; max-age=${365 * 24 * 60 * 60}; samesite=lax`;
            setTimeout(() => window.location.reload(), 0);
        },
        [currentLocale],
    );

    const handleLogout = useCallback(async () => {
        try {
            const res = await fetch("/api/auth/logout", {
                method: "POST",
                headers: { "x-csrf-token": csrfToken },
            });
            const data = (await res.json()) as { logoutUrl?: string };
            if (data.logoutUrl) {
                window.location.href = data.logoutUrl;
            } else {
                window.location.href = "/login";
            }
        } catch {
            window.location.href = "/login";
        }
    }, [csrfToken]);

    const setViewport = useCallback((vp: Viewport) => {
        setViewportState(vp);
        applyViewport(vp);
    }, []);

    return {
        handleThemeChange,
        handlePresetChange,
        handleLocaleChange,
        handleLogout,
        viewport,
        setViewport,
        themeMode,
        themePreset,
        resolvedThemeMode,
    };
}

// ─── Composed hook ───────────────────────────────────────────────────────────

export function useUserMenuModel(): UserMenuModel {
    const bootstrap = useBootstrap();
    const identity = useIdentity(bootstrap);
    const visibility = useMenuVisibility(bootstrap);
    const handlers = useMenuHandlers(bootstrap);

    return useMemo<UserMenuModel>(
        () => ({
            // Identity
            ...identity,

            // Context
            userId: bootstrap?.userId ?? "",
            tenantId: bootstrap?.tenantId ?? "default",
            tenantDisplayName: bootstrap?.tenantDisplayName ?? bootstrap?.tenantId ?? "default",
            currentLocale: bootstrap?.locale ?? "en",
            csrfToken: bootstrap?.csrfToken ?? "",
            isPlatformAdmin: bootstrap?.isPlatformAdmin ?? false,
            selectedTenantId: bootstrap?.selectedTenantId ?? null,
            subscriptionTier: bootstrap?.subscriptionTier ?? "Standard",
            environment: bootstrap?.environment ?? "local",
            featureFlags: bootstrap?.featureFlags ?? {},

            // Visibility
            visibility,

            // Handlers + theme + viewport
            ...handlers,

            // Hydration
            ready: bootstrap !== null,
        }),
        [bootstrap, identity, visibility, handlers],
    );
}
