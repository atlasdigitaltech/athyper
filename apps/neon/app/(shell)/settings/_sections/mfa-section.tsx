"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound, RefreshCw, ShieldOff, Smartphone,
  Trash2, AlertTriangle, Fingerprint, Monitor, Plus,
  ShieldCheck, ShieldAlert,
} from "lucide-react";
import {
  Button, Badge, Card, CardContent,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Label, Skeleton,
} from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { getCsrfToken } from "@/lib/bff-fetch";

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface MfaMethod {
  id: string;
  method_type: string;
  authority?: string | null;
  is_enabled: boolean;
  is_verified: boolean;
  is_primary: boolean;
  enrolled_at: string | null;
  verified_at: string | null;
  last_used_at: string | null;
  keycloak_sync_status: string | null;
  updated_at: string | null;
  user_label?: string | null;
}

interface TrustedDevice {
  id: string;
  device_name: string | null;
  user_agent: string | null;
  ip_address: string | null;
  last_seen_at: string | null;
  expires_at: string;
  created_at: string;
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const METHOD_LABELS: Record<string, string> = {
  totp:     "Authenticator App",
  webauthn: "Security Key / Passkey",
  email:    "Email",
  backup:   "Backup Codes",
};

function methodLabel(type: string, userLabel?: string | null): string {
  if (userLabel) return userLabel;
  return METHOD_LABELS[type] ?? type;
}

function methodIcon(type: string) {
  if (type === "totp")     return <Smartphone className="h-4 w-4" />;
  if (type === "webauthn") return <Fingerprint className="h-4 w-4" />;
  return <KeyRound className="h-4 w-4" />;
}

const SYNC_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  synced: "success", pending: "warning", error: "destructive", drift: "warning", skipped: "muted",
};

// â”€â”€ StepUpDialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function StepUpDialog({ open, onOpenChange, actionClass, onElevated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  actionClass: string;
  onElevated: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const elevate = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/iam/mfa/elevate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ action_class: actionClass }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Invalid code");
    },
    onSuccess: () => { onOpenChange(false); setError(null); onElevated(); },
    onError: () => {
      void fetch("/api/auth/step-up/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ action_class: actionClass, returnUrl: window.location.href }),
      })
        .then(async (res) => {
          const body = await res.json().catch(() => ({})) as { reauthenticate_url?: string; message?: string };
          if (!res.ok || !body.reauthenticate_url) throw new Error(body.message ?? "Keycloak step-up could not be started");
          window.location.assign(body.reauthenticate_url);
        })
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Keycloak step-up could not be started"));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Security Verification</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">Complete MFA in Keycloak to confirm this action.</p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => elevate.mutate()} disabled={elevate.isPending}>Continue with Keycloak</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// â”€â”€ TotpEnrollWizard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Keycloak owns TOTP enrollment; no local secret, QR or verification UI is registered.


function KeycloakTotpEnrollCard() {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  async function startEnrollment() {
    setStarting(true);
    setError(null);
    try {
      const redirectUri = `${window.location.origin}/settings?section=security&mfa_sync=1`;
      const res = await fetch("/api/iam/mfa/totp/begin", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ redirect_uri: redirectUri }),
      });
      const data = await res.json().catch(() => ({})) as { redirect_url?: string; message?: string };
      if (!res.ok || !data.redirect_url) throw new Error(data.message ?? "Failed to start Keycloak enrollment");
      window.location.assign(data.redirect_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start enrollment");
      setStarting(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-border p-4 space-y-3">
      <div>
        <p className="text-sm font-medium">Authenticator app</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Keycloak securely generates, stores, and verifies your TOTP secret.
        </p>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button variant="outline" size="sm" onClick={() => void startEnrollment()} disabled={starting}>
        <Smartphone className="mr-1.5 h-3.5 w-3.5" />
        {starting ? "Opening Keycloak..." : "Set up authenticator"}
      </Button>
    </div>
  );
}

// â”€â”€ WebAuthnEnrollCard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function WebAuthnEnrollCard({ onSyncDone }: { onSyncDone: () => void }) {
  const [error, setError]   = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const startEnroll = useMutation({
    mutationFn: async () => {
      const redirectUri = `${window.location.origin}/settings?section=security&mfa_sync=1`;
      const res = await fetch("/api/iam/mfa/webauthn/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ redirect_uri: redirectUri }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Failed to start WebAuthn enrollment");
      const data = await res.json() as { redirect_url: string };
      return data.redirect_url;
    },
    onSuccess: (redirectUrl) => { window.location.href = redirectUrl; },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  async function handleSync() {
    setSyncing(true); setError(null);
    try {
      const res = await fetch("/api/iam/mfa/sync", { method: "POST", headers: { "X-CSRF-Token": getCsrfToken() } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Sync failed");
      onSyncDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Fingerprint className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Security Key / Passkey</p>
          <p className="text-xs text-muted-foreground mt-0.5">Use a hardware security key or biometric passkey.</p>
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => startEnroll.mutate()} disabled={startEnroll.isPending}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Security Key
        </Button>
        <Button
          variant="ghost" size="sm"
          onClick={() => void handleSync()}
          disabled={syncing}
          title="Sync status from identity provider"
          className="text-muted-foreground"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", syncing && "animate-spin")} /> Sync
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        You will be redirected to the identity provider to complete registration.
      </p>
    </div>
  );
}

// â”€â”€ TrustedDevicesPanel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TrustedDevicesPanel() {
  const qc = useQueryClient();
  const [stepUpOpen, setStepUpOpen]       = useState(false);
  const [deviceName, setDeviceName]       = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const { data, isLoading } = useQuery<{ devices: TrustedDevice[] }>({
    queryKey: ["trusted-devices"],
    queryFn: async () => {
      const res = await fetch("/api/iam/trusted-devices");
      return res.ok ? res.json() : { devices: [] };
    },
    staleTime: 30_000,
  });

  const devices = data?.devices ?? [];

  const addDevice = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/iam/trusted-devices", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ device_name: deviceName.trim() || undefined, ttl_days: 30 }),
      });
      if (res.status === 403) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        if (json.error === "STEP_UP_REQUIRED") { setAddDialogOpen(false); setStepUpOpen(true); return; }
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Failed");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["trusted-devices"] }); setAddDialogOpen(false); setDeviceName(""); },
  });

  const revokeDevice = useMutation({
    mutationFn: async (deviceId: string) => {
      const res = await fetch(`/api/iam/trusted-devices/${deviceId}`, { method: "DELETE", headers: { "X-CSRF-Token": getCsrfToken() } });
      if (!res.ok && res.status !== 204) throw new Error("Failed to revoke");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trusted-devices"] }),
  });

  const revokeAll = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/iam/trusted-devices", { method: "DELETE", headers: { "X-CSRF-Token": getCsrfToken() } });
      if (!res.ok) throw new Error("Failed to revoke all");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trusted-devices"] }),
  });

  function formatDevice(d: TrustedDevice): string {
    if (d.device_name) return d.device_name;
    const ua = d.user_agent ?? "";
    if (ua.includes("iPhone") || ua.includes("iPad")) return "iPhone / iPad";
    if (ua.includes("Android")) return "Android Device";
    if (ua.includes("Mac")) return "Mac";
    if (ua.includes("Windows")) return "Windows PC";
    return "Browser";
  }

  function isExpiringSoon(d: TrustedDevice): boolean {
    return (new Date(d.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24) < 7;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">Trusted Devices</h3>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => qc.invalidateQueries({ queryKey: ["trusted-devices"] })} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-1 h-3 w-3" /> Add Device
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Trusted devices skip MFA for 30 days. Revoke any device you don't recognize.
      </p>

      {isLoading ? (
        <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : devices.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-4 text-center">
          <Monitor className="mx-auto mb-1.5 h-6 w-6 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">No trusted devices registered.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {devices.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Monitor className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <p className="text-sm font-medium truncate">{formatDevice(d)}</p>
                  {isExpiringSoon(d) && <Badge variant="warning" className="text-xs">Expiring soon</Badge>}
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                  {d.last_seen_at && <span>Last seen: {new Date(d.last_seen_at).toLocaleDateString()}</span>}
                  <span>Expires: {new Date(d.expires_at).toLocaleDateString()}</span>
                  {d.ip_address && <span>{d.ip_address}</span>}
                </div>
              </div>
              <Button
                size="sm" variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                title="Revoke device"
                onClick={() => revokeDevice.mutate(d.id)}
                disabled={revokeDevice.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {devices.length > 0 && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive hover:text-destructive px-2"
            onClick={() => revokeAll.mutate()} disabled={revokeAll.isPending}>
            <ShieldAlert className="mr-1.5 h-3 w-3" /> Revoke All Devices
          </Button>
        </div>
      )}

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Trust This Device</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Label this device for easy identification. Trusted for 30 days.</p>
            <div className="space-y-1">
              <Label className="text-xs">Device Label</Label>
              <Input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="e.g. Work MacBook" />
            </div>
            <p className="text-xs text-muted-foreground">This action requires a step-up verification for security.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => addDevice.mutate()} disabled={addDevice.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StepUpDialog open={stepUpOpen} onOpenChange={setStepUpOpen} actionClass="security_change" onElevated={() => addDevice.mutate()} />
    </div>
  );
}

// â”€â”€ MfaSection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function MfaSection({ active }: { active: boolean }) {
  const qc = useQueryClient();
  const [stepUpOpen, setStepUpOpen]         = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("mfa_sync") === "1") {
      const url = new URL(window.location.href);
      url.searchParams.delete("mfa_sync");
      window.history.replaceState({}, "", url.toString());
      void fetch("/api/iam/mfa/sync", { method: "POST", headers: { "X-CSRF-Token": getCsrfToken() } }).then(() => {
        void qc.invalidateQueries({ queryKey: ["iam-mfa-methods"] });
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isLoading } = useQuery<{ principal_id: string; methods: MfaMethod[] }>({
    queryKey: ["iam-mfa-methods"],
    queryFn: async () => {
      const res = await fetch("/api/iam/mfa");
      return res.ok ? res.json() : { principal_id: "", methods: [] };
    },
    enabled: active,
    staleTime: 0,
  });

  const methods       = data?.methods ?? [];
  const hasActiveMfa  = methods.some((m) => m.is_enabled && m.is_verified);
  const totpMethod    = methods.find((m) => m.method_type === "totp" && m.is_enabled && m.is_verified);
  const webauthnMethod = methods.find((m) => m.method_type === "webauthn" && m.is_enabled && m.is_verified);

  const deleteMethod = useMutation({
    mutationFn: async (methodId: string) => {
      const res = await fetch(`/api/iam/mfa/${methodId}`, { method: "DELETE", headers: { "X-CSRF-Token": getCsrfToken() } });
      if (res.status === 403) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        if (json.error === "STEP_UP_REQUIRED") { setPendingDeleteId(methodId); setStepUpOpen(true); return; }
        throw new Error("Permission denied");
      }
      if (!res.ok && res.status !== 204) throw new Error("Failed to remove method");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["iam-mfa-methods"] }); setPendingDeleteId(null); },
  });

  if (isLoading) {
    return <div className="space-y-3">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  return (
    <div className="w-full space-y-6">
      {/* Status banner */}
      <div className={cn(
        "flex items-center gap-2.5 rounded-lg border px-4 py-3 text-sm",
        hasActiveMfa ? "border-success/30 bg-success/5 text-success" : "border-warning/30 bg-warning/10 text-warning",
      )}>
        {hasActiveMfa
          ? <><ShieldCheck className="h-4 w-4 shrink-0" /><span>MFA is active. Your account is protected.</span></>
          : <><AlertTriangle className="h-4 w-4 shrink-0" /><span>No MFA enrolled. We strongly recommend adding an authenticator.</span></>
        }
      </div>

      {/* Enrolled methods */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-muted-foreground">Enrolled Methods</h3>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => qc.invalidateQueries({ queryKey: ["iam-mfa-methods"] })} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {methods.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center">
            <ShieldOff className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No MFA methods enrolled.</p>
          </div>
        ) : (
          methods.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="text-muted-foreground">{methodIcon(m.method_type)}</div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{methodLabel(m.method_type, m.user_label)}</p>
                    {m.is_primary && <Badge variant="success" className="text-xs">Primary</Badge>}
                    {m.is_verified && m.is_enabled
                      ? <Badge variant="success" className="text-xs">Active</Badge>
                      : m.is_verified
                      ? <Badge variant="muted" className="text-xs">Disabled</Badge>
                      : <Badge variant="warning" className="text-xs">Pending</Badge>
                    }
                    {m.keycloak_sync_status && (
                      <Badge variant={SYNC_VARIANT[m.keycloak_sync_status] ?? "muted"} className="text-xs">
                        {m.keycloak_sync_status === "synced" ? "Synced" : m.keycloak_sync_status}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    {m.enrolled_at  && <span>Enrolled: {new Date(m.enrolled_at).toLocaleDateString()}</span>}
                    {m.last_used_at && <span>Last used: {new Date(m.last_used_at).toLocaleDateString()}</span>}
                  </div>
                </div>
                <Button
                  size="sm" variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                  title="Remove method"
                  onClick={() => deleteMethod.mutate(m.id)}
                  disabled={deleteMethod.isPending || stepUpOpen}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Add new methods */}
      {(!totpMethod || !webauthnMethod) && (
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground">Add a Method</h3>
          {!totpMethod && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Use any TOTP authenticator app (Google Authenticator, Authy, etc.).</p>
              <KeycloakTotpEnrollCard />
            </div>
          )}
          {!webauthnMethod && (
            <WebAuthnEnrollCard onSyncDone={() => qc.invalidateQueries({ queryKey: ["iam-mfa-methods"] })} />
          )}
        </div>
      )}

      {/* Trusted Devices */}
      <TrustedDevicesPanel />

      {/* Security notes */}
      <div className="rounded-md bg-muted/40 px-4 py-3 space-y-1 text-xs text-muted-foreground">
        <p className="font-medium text-foreground text-xs">Security notes</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Removing a method requires a fresh Keycloak MFA step-up.</li>
          <li>If you lose access, contact your administrator to re-enroll.</li>
          <li>Trusted devices expire after 30 days.</li>
          <li>High-risk actions (delegation, session rebuild) always require step-up regardless of trusted device.</li>
          <li>Trusted devices do not bypass step-up for security_change actions.</li>
          <li>WebAuthn / passkeys require browser and device support.</li>
        </ul>
      </div>

      <StepUpDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        actionClass="security_change"
        onElevated={() => { if (pendingDeleteId) deleteMethod.mutate(pendingDeleteId); }}
      />
    </div>
  );
}
