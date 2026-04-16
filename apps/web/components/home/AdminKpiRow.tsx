"use client";

/**
 * AdminKpiRow — live KPI tiles for the admin workbench home.
 *
 * Fetches platform stats (tenant count, module count, principal count)
 * from the /api/admin/stats BFF endpoint.
 */

import { Activity, BadgeCheck, Building2, Layers } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { KpiCard } from "./KpiCard";

interface AdminStats {
  active_tenants:    number;
  active_modules:    number;
  active_principals: number;
  system_health:     string;
}

function useAdminStats() {
  return useQuery<AdminStats>({
    queryKey: ["admin", "stats"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/admin/stats", { signal, cache: "no-store" });
      if (!res.ok) return { active_tenants: 0, active_modules: 0, active_principals: 0, system_health: "unknown" };
      return res.json() as Promise<AdminStats>;
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    throwOnError: false,
    placeholderData: { active_tenants: 0, active_modules: 0, active_principals: 0, system_health: "ok" },
  });
}

export function AdminKpiRow() {
  const { data, isLoading } = useAdminStats();

  const healthLabel = data?.system_health === "ok" ? "Healthy" : (data?.system_health ?? "—");

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        title="Active Tenants"
        value={data?.active_tenants ?? "—"}
        Icon={Building2}
        iconClass="text-info"
        loading={isLoading}
      />
      <KpiCard
        title="Active Modules"
        value={data?.active_modules ?? "—"}
        Icon={Layers}
        iconClass="text-primary"
        loading={isLoading}
      />
      <KpiCard
        title="Principals"
        value={data?.active_principals ?? "—"}
        Icon={BadgeCheck}
        iconClass="text-success"
        loading={isLoading}
      />
      <KpiCard
        title="System Health"
        value={healthLabel}
        Icon={Activity}
        iconClass={data?.system_health === "ok" ? "text-success" : "text-warning"}
        loading={isLoading}
      />
    </div>
  );
}
