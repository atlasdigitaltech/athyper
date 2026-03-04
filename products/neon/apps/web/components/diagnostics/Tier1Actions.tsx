"use client";

// components/diagnostics/Tier1Actions.tsx
//
// Tier 1 — Essential diagnostic actions that every user should have.

import { Database, RefreshCw, Shield, Trash2, Wrench } from "lucide-react";
import { useState } from "react";

import { ActionCard } from "./ActionCard";
import { useDiagnosticAction } from "./useDiagnosticAction";

import type { ActionResult } from "./useDiagnosticAction";

import { useMessages } from "@/lib/i18n/messages-context";

interface Tier1ActionsProps {
  onActionComplete?: () => void;
}

export function Tier1Actions({ onActionComplete }: Tier1ActionsProps) {
  const { t } = useMessages();
  const refreshToken = useDiagnosticAction({
    url: "/api/auth/refresh",
    method: "POST",
    onSuccess: onActionComplete,
  });

  const reloadAppCache = useDiagnosticAction({
    url: "/api/admin/cache/clear?scope=app",
    method: "POST",
    onSuccess: onActionComplete,
  });

  const reloadPermissions = useDiagnosticAction({
    url: "/api/admin/cache/clear?scope=rbac",
    method: "POST",
    onSuccess: onActionComplete,
  });

  const autofix = useDiagnosticAction({
    url: "/api/admin/autofix",
    method: "POST",
    onSuccess: () => {
      onActionComplete?.();
      // Soft reload after autofix completes
      setTimeout(() => window.location.reload(), 1500);
    },
  });

  // Browser cache clear is client-side only
  const [browserCacheLoading, setBrowserCacheLoading] = useState(false);
  const [browserCacheResult, setBrowserCacheResult] =
    useState<ActionResult | null>(null);

  async function clearBrowserCache() {
    setBrowserCacheLoading(true);
    setBrowserCacheResult(null);
    try {
      localStorage.clear();
      sessionStorage.clear();
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      }
      setBrowserCacheResult({
        ok: true,
        message: t("diag.tier1.browser_cleared"),
      });
    } catch (err) {
      setBrowserCacheResult({
        ok: false,
        message: err instanceof Error ? err.message : t("diag.tier1.failed"),
      });
    } finally {
      setBrowserCacheLoading(false);
      setTimeout(() => setBrowserCacheResult(null), 5000);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{t("diag.tier1.title")}</h3>
        <span className="text-xs text-muted-foreground">
          {t("diag.tier1.subtitle")}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ActionCard
          icon={RefreshCw}
          title={t("diag.tier1.refresh_token.title")}
          description={t("diag.tier1.refresh_token.desc")}
          buttonLabel={t("diag.tier1.refresh_token.button")}
          loading={refreshToken.loading}
          result={refreshToken.result}
          onExecute={refreshToken.execute}
        />
        <ActionCard
          icon={Database}
          title={t("diag.tier1.reload_cache.title")}
          description={t("diag.tier1.reload_cache.desc")}
          buttonLabel={t("diag.tier1.reload_cache.button")}
          loading={reloadAppCache.loading}
          result={reloadAppCache.result}
          onExecute={reloadAppCache.execute}
        />
        <ActionCard
          icon={Shield}
          title={t("diag.tier1.reload_permissions.title")}
          description={t("diag.tier1.reload_permissions.desc")}
          buttonLabel={t("diag.tier1.reload_permissions.button")}
          loading={reloadPermissions.loading}
          result={reloadPermissions.result}
          onExecute={reloadPermissions.execute}
        />
        <ActionCard
          icon={Trash2}
          title={t("diag.tier1.clear_browser.title")}
          description={t("diag.tier1.clear_browser.desc")}
          buttonLabel={t("diag.tier1.clear_browser.button")}
          loading={browserCacheLoading}
          result={browserCacheResult}
          onExecute={clearBrowserCache}
        />
        <ActionCard
          icon={Wrench}
          title={t("diag.tier1.autofix.title")}
          description={t("diag.tier1.autofix.desc")}
          buttonLabel={t("diag.tier1.autofix.button")}
          variant="primary"
          loading={autofix.loading}
          result={autofix.result}
          onExecute={autofix.execute}
        />
      </div>
    </div>
  );
}
