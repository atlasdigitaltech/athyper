"use client";

import { useCallback, useEffect, useState } from "react";

interface Tenant {
  id: string;
  code: string;
  name: string;
  status: string;
  region?: string;
  subscriptionTier?: string;
}

interface TenantSelectorProps {
  currentTenantId: string | null;
  onSwitch: (tenantId: string) => void;
  csrfToken: string;
}

/**
 * Tenant selector dropdown for platform administrators.
 * Fetches the tenant list from /api/platform/tenants and allows switching.
 */
export function TenantSelector({
  currentTenantId,
  onSwitch,
  csrfToken,
}: TenantSelectorProps) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [confirmTenantId, setConfirmTenantId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/platform/tenants")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ tenants: Tenant[] }>;
      })
      .then((data) => {
        setTenants(data.tenants ?? []);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSwitch = useCallback(
    async (tenantId: string) => {
      setSwitching(true);
      setConfirmTenantId(null);

      try {
        const res = await fetch("/api/platform/tenants/switch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          body: JSON.stringify({ tenantId }),
        });

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }

        onSwitch(tenantId);
        // Reload to re-bootstrap the session with the new tenant context
        window.location.reload();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Switch failed");
      } finally {
        setSwitching(false);
      }
    },
    [csrfToken, onSwitch],
  );

  if (loading) {
    return <div className="p-4 text-sm text-gray-500">Loading tenants...</div>;
  }

  if (error) {
    return <div className="p-4 text-sm text-red-600">Error: {error}</div>;
  }

  if (tenants.length === 0) {
    return <div className="p-4 text-sm text-gray-500">No tenants found.</div>;
  }

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-3">Select Tenant</h2>
      <div className="space-y-2">
        {tenants.map((tenant) => (
          <div
            key={tenant.id}
            className={`flex items-center justify-between p-3 rounded-lg border ${
              tenant.id === currentTenantId
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:border-gray-400"
            }`}
          >
            <div>
              <div className="font-medium">{tenant.name}</div>
              <div className="text-xs text-gray-500">
                {tenant.code} · {tenant.status}
                {tenant.region && ` · ${tenant.region}`}
              </div>
            </div>
            {tenant.id !== currentTenantId &&
              (confirmTenantId === tenant.id ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSwitch(tenant.id)}
                    disabled={switching}
                    className="px-3 py-1 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
                  >
                    {switching ? "Switching..." : "Confirm"}
                  </button>
                  <button
                    onClick={() => setConfirmTenantId(null)}
                    className="px-3 py-1 text-sm border rounded hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmTenantId(tenant.id)}
                  className="px-3 py-1 text-sm border rounded hover:bg-gray-100"
                >
                  Switch
                </button>
              ))}
            {tenant.id === currentTenantId && (
              <span className="text-xs text-blue-600 font-medium">Current</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
