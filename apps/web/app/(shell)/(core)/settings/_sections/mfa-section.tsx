"use client";

/**
 * Security & MFA Settings Section — /settings?section=security
 *
 * Shows enrolled MFA methods and drives enrollment flows:
 *
 *   TOTP (self-hosted):
 *     Step 1: "Set up authenticator" → POST /api/iam/mfa/totp/begin
 *     Step 2: Show QR + secret key → user scans / enters manually
 *     Step 3: Verify 6-digit code → POST /api/iam/mfa/totp/verify
 *     Step 4: Success banner, method list refreshes
 *
 *   WebAuthn (KC AIA):
 *     Step 1: "Add Security Key" → POST /api/iam/mfa/webauthn/start (returns KC redirect URL)
 *     Step 2: Browser navigates to KC hosted WebAuthn registration UI
 *     Step 3: KC redirects back to /settings?section=security&mfa_sync=1
 *     Step 4: Component detects mfa_sync=1 → POST /api/iam/mfa/sync → method list refreshes
 *
 *   Removing a method:
 *     Requires security_change step-up (server-enforced).
 *     Step-up challenge flow: enter live TOTP code → POST /api/iam/mfa/elevate
 *     → server grants elevation → client retries DELETE.
 *
 *   Trusted Devices:
 *     List:     GET  /api/iam/trusted-devices
 *     Register: POST /api/iam/trusted-devices  (security_change step-up)
 *     Revoke:   DELETE /api/iam/trusted-devices/:id
 *     Panic:    DELETE /api/iam/trusted-devices  (revoke all)
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, KeyRound, QrCode, RefreshCw, ShieldOff, Smartphone,
  Trash2, Copy, Check, AlertTriangle, Fingerprint, Monitor, Plus,
  ShieldCheck, ShieldAlert,
} from "lucide-react";
import {
  Button, Badge, Card, CardContent,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Label, Skeleton,
} from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { getCsrfToken } from "@/lib/bff-fetch";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MfaMethod {
  id: string;
  method_type: string;
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

interface EnrollBeginResult {
  mfa_config_id: string;
  secret_base32: string;
  otpauth_uri:   string;
  qr_svg:        string;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function methodLabel(type: string, userLabel?: string | null): string {
  if (userLabel) return userLabel;
  return type === "totp"     ? "Authenticator App (TOTP)"
       : type === "webauthn" ? "Security Key / Passkey"
       : type === "sms"      ? "SMS One-Time Code"
       : type === "email"    ? "Email One-Time Code"
       : type === "backup"   ? "Backup Codes"
       : type;
}

function methodIcon(type: string) {
  if (type === "totp")     return <Smartphone className="h-4 w-4" />;
  if (type === "webauthn") return <Fingerprint className="h-4 w-4" />;
  return <KeyRound className="h-4 w-4" />;
}

const SYNC_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  synced: "success", pending: "warning", error: "destructive", drift: "warning", skipped: "muted",
};

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-1.5 text-muted-foreground hover:text-foreground transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// ── StepUpDialog ──────────────────────────────────────────────────────────────
// Used before high-risk actions that require a live TOTP code.

function StepUpDialog({
  open,
  onOpenChange,
  actionClass,
  onElevated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  actionClass: string;
  onElevated: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const elevate = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/iam/mfa/elevate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ action_class: actionClass, code: code.trim(), method_type: "totp" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Invalid code");
    },
    onSuccess: () => {
      onOpenChange(false);
      setCode(""); setError(null);
      onElevated();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Invalid code"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Security Verification</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Enter your current 6-digit authenticator code to authorize this action.
          </p>
          <div className="space-y-1">
            <Label className="text-xs">Authenticator Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="font-mono text-center text-xl tracking-widest"
              maxLength={6}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && code.length === 6 && elevate.mutate()}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => elevate.mutate()} disabled={code.length !== 6 || elevate.isPending}>
            Verify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── TotpEnrollWizard ──────────────────────────────────────────────────────────
// 3-step wizard: begin → show QR → verify code → done

type WizardStep = "idle" | "qr" | "verify" | "done";

function TotpEnrollWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep]         = useState<WizardStep>("idle");
  const [pending, setPending]   = useState<EnrollBeginResult | null>(null);
  const [code, setCode]         = useState("");
  const [error, setError]       = useState<string | null>(null);

  const begin = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/iam/mfa/totp/begin", { method: "POST", headers: { "X-CSRF-Token": getCsrfToken() } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Failed to start enrollment");
      return res.json() as Promise<EnrollBeginResult>;
    },
    onSuccess: (data) => {
      setPending(data);
      setStep("qr");
      setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  const verify = useMutation({
    mutationFn: async () => {
      if (!pending) throw new Error("No pending enrollment");
      const res = await fetch("/api/iam/mfa/totp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ mfa_config_id: pending.mfa_config_id, code: code.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Invalid code");
    },
    onSuccess: () => {
      setStep("done");
      setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Invalid code — try again"),
  });

  if (step === "idle") {
    return (
      <div className="mt-3">
        {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
        <Button
          variant="outline"
          size="sm"
          onClick={() => begin.mutate()}
          disabled={begin.isPending}
        >
          <QrCode className="mr-1.5 h-3.5 w-3.5" />
          Set up Authenticator App
        </Button>
      </div>
    );
  }

  if (step === "qr" && pending) {
    const formattedSecret = pending.secret_base32.match(/.{1,4}/g)?.join(" ") ?? pending.secret_base32;
    return (
      <div className="mt-3 rounded-lg border p-4 space-y-4">
        <div>
          <p className="text-sm font-medium">1. Scan this QR code with your authenticator app</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Use Google Authenticator, Authy, 1Password, or any TOTP-compatible app.
          </p>
        </div>

        <div
          className="flex items-center justify-center rounded-md border bg-qr-surface p-2 w-fit"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: pending.qr_svg }}
        />

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Or enter this key manually:</p>
          <div className="flex items-center rounded-md border bg-muted px-3 py-1.5">
            <code className="flex-1 font-mono text-xs tracking-wide">{formattedSecret}</code>
            <CopyButton text={pending.secret_base32} />
          </div>
        </div>

        <Button size="sm" onClick={() => { setStep("verify"); setCode(""); setError(null); }}>
          I&apos;ve scanned it — Continue
        </Button>
      </div>
    );
  }

  if (step === "verify") {
    return (
      <div className="mt-3 rounded-lg border p-4 space-y-3">
        <div>
          <p className="text-sm font-medium">2. Enter the 6-digit code from your app</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Codes refresh every 30 seconds. Enter the current code to confirm enrollment.
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Verification Code</Label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className="max-w-35 font-mono text-center text-lg tracking-widest"
            maxLength={6}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && code.length === 6 && verify.mutate()}
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setStep("qr"); setError(null); }}>Back</Button>
          <Button size="sm" onClick={() => verify.mutate()} disabled={code.length !== 6 || verify.isPending}>
            Verify & Enable
          </Button>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>Authenticator app enrolled successfully.</span>
        <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => { setStep("idle"); onDone(); }}>
          Done
        </Button>
      </div>
    );
  }

  return null;
}

// ── WebAuthnEnrollCard ────────────────────────────────────────────────────────
// Triggers KC AIA flow for WebAuthn/Passkey enrollment.

function WebAuthnEnrollCard({ onSyncDone }: { onSyncDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const startEnroll = useMutation({
    mutationFn: async () => {
      // redirect_uri: come back to /settings?section=security&mfa_sync=1
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
    onSuccess: (redirectUrl) => {
      // Navigate to KC hosted WebAuthn registration UI
      window.location.href = redirectUrl;
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  // Manual sync trigger (for when the user returns via a different path)
  async function handleSync() {
    setSyncing(true);
    setError(null);
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
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Fingerprint className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Security Key / Passkey</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Use a hardware security key (YubiKey, etc.) or a platform authenticator
            (Face ID, Touch ID, Windows Hello) as your second factor.
          </p>
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => startEnroll.mutate()}
          disabled={startEnroll.isPending}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Register Security Key
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleSync()}
          disabled={syncing}
          title="Sync credentials from Keycloak"
          className="text-muted-foreground"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", syncing && "animate-spin")} />
          Sync
        </Button>
      </div>
      <p className="text-doc-support text-muted-foreground">
        You&apos;ll be redirected to the authentication portal to complete registration.
        Return here afterwards and the new key will appear in your methods list.
      </p>
    </div>
  );
}

// ── TrustedDevicesPanel ───────────────────────────────────────────────────────

function TrustedDevicesPanel() {
  const qc = useQueryClient();
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [deviceName, setDeviceName] = useState("");
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
        if (json.error === "STEP_UP_REQUIRED") {
          setAddDialogOpen(false);
          setStepUpOpen(true);
          return;
        }
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trusted-devices"] });
      setAddDialogOpen(false);
      setDeviceName("");
    },
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
    // Extract a browser+OS hint from user agent
    if (ua.includes("iPhone") || ua.includes("iPad")) return "iPhone / iPad";
    if (ua.includes("Android")) return "Android Device";
    if (ua.includes("Mac")) return "Mac";
    if (ua.includes("Windows")) return "Windows PC";
    return "Browser Session";
  }

  function isExpiringSoon(d: TrustedDevice): boolean {
    const daysLeft = (new Date(d.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return daysLeft < 7;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Trusted Devices
        </h3>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => qc.invalidateQueries({ queryKey: ["trusted-devices"] })}
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => setAddDialogOpen(true)}
          >
            <Plus className="mr-1 h-3 w-3" />Trust this device
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Trusted devices skip the MFA step-up challenge for up to 30 days. Revoke a device
        immediately if it is lost, stolen, or no longer yours.
      </p>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : devices.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center">
          <Monitor className="mx-auto mb-1.5 h-6 w-6 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">No trusted devices registered.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {devices.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Monitor className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <p className="text-sm font-medium truncate">{formatDevice(d)}</p>
                  {isExpiringSoon(d) && (
                    <Badge variant="warning" className="text-doc-field-label">expiring soon</Badge>
                  )}
                </div>
                <div className="flex gap-3 text-doc-support text-muted-foreground mt-0.5">
                  {d.last_seen_at && <span>Last seen {new Date(d.last_seen_at).toLocaleDateString()}</span>}
                  <span>Expires {new Date(d.expires_at).toLocaleDateString()}</span>
                  {d.ip_address && <span>{d.ip_address}</span>}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                title="Revoke this device"
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
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-destructive hover:text-destructive px-2"
            onClick={() => revokeAll.mutate()}
            disabled={revokeAll.isPending}
          >
            <ShieldAlert className="mr-1.5 h-3 w-3" />
            Revoke all devices
          </Button>
        </div>
      )}

      {/* Add device dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Trust This Device</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              This browser session will skip MFA step-up for the next 30 days.
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Device Label (optional)</Label>
              <Input
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="e.g. Work Laptop, Home Mac"
              />
            </div>
            <p className="text-doc-support text-muted-foreground">
              You will need to complete a security verification (MFA step-up) to confirm.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => addDevice.mutate()} disabled={addDevice.isPending}>
              Trust Device
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step-up challenge for adding trusted device */}
      <StepUpDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        actionClass="security_change"
        onElevated={() => addDevice.mutate()}
      />
    </div>
  );
}

// ── MfaSection ────────────────────────────────────────────────────────────────

export function MfaSection({ active }: { active: boolean }) {
  const qc = useQueryClient();
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Auto-sync after returning from KC WebAuthn AIA flow.
  // KC redirects to /settings?section=security&mfa_sync=1
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("mfa_sync") === "1") {
      // Clean the URL without reload
      const url = new URL(window.location.href);
      url.searchParams.delete("mfa_sync");
      window.history.replaceState({}, "", url.toString());

      // Trigger sync
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

  const methods = data?.methods ?? [];
  const hasActiveMfa  = methods.some((m) => m.is_enabled && m.is_verified);
  const totpMethod    = methods.find((m) => m.method_type === "totp" && m.is_enabled && m.is_verified);
  const webauthnMethod = methods.find((m) => m.method_type === "webauthn" && m.is_enabled && m.is_verified);

  const deleteMethod = useMutation({
    mutationFn: async (methodId: string) => {
      const res = await fetch(`/api/iam/mfa/${methodId}`, { method: "DELETE", headers: { "X-CSRF-Token": getCsrfToken() } });
      if (res.status === 403) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        if (json.error === "STEP_UP_REQUIRED") {
          setPendingDeleteId(methodId);
          setStepUpOpen(true);
          return;
        }
        throw new Error("Permission denied");
      }
      if (!res.ok && res.status !== 204) throw new Error("Failed to remove method");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["iam-mfa-methods"] });
      setPendingDeleteId(null);
    },
  });

  function handleDeleteAfterElevation() {
    if (pendingDeleteId) deleteMethod.mutate(pendingDeleteId);
  }

  if (isLoading) {
    return <div className="space-y-3">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  return (
    <div className="w-full space-y-6">
      {/* Status banner */}
      <div className={cn(
        "flex items-center gap-2.5 rounded-lg border px-4 py-3 text-sm",
        hasActiveMfa
          ? "border-success/30 bg-success/5 text-success"
          : "border-warning/30 bg-warning/10 text-warning",
      )}>
        {hasActiveMfa
          ? <><ShieldCheck className="h-4 w-4 shrink-0" /><span>Multi-factor authentication is active.</span></>
          : <><AlertTriangle className="h-4 w-4 shrink-0" /><span>MFA is not enabled. Add an authentication method to protect your account.</span></>
        }
      </div>

      {/* Enrolled methods */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Authentication Methods
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => qc.invalidateQueries({ queryKey: ["iam-mfa-methods"] })}
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {methods.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center">
            <ShieldOff className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No authentication methods enrolled.</p>
          </div>
        ) : (
          methods.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="text-muted-foreground">{methodIcon(m.method_type)}</div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{methodLabel(m.method_type, m.user_label)}</p>
                    {m.is_primary && (
                      <Badge variant="success" className="text-doc-field-label">Primary</Badge>
                    )}
                    {m.is_verified && m.is_enabled
                      ? <Badge variant="success" className="text-doc-support">Active</Badge>
                      : m.is_verified
                      ? <Badge variant="muted" className="text-doc-support">Disabled</Badge>
                      : <Badge variant="warning" className="text-doc-support">Pending verification</Badge>
                    }
                    {m.keycloak_sync_status && (
                      <Badge
                        variant={SYNC_VARIANT[m.keycloak_sync_status] ?? "muted"}
                        className="text-doc-field-label"
                      >
                        {m.keycloak_sync_status === "synced" ? "sync: active" : `sync: ${m.keycloak_sync_status}`}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-3 text-doc-support text-muted-foreground">
                    {m.enrolled_at && <span>Enrolled {new Date(m.enrolled_at).toLocaleDateString()}</span>}
                    {m.last_used_at && <span>Last used {new Date(m.last_used_at).toLocaleDateString()}</span>}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
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
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Add Authentication Method
          </h3>

          {/* TOTP */}
          {!totpMethod && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Use a TOTP authenticator app (Google Authenticator, Authy, 1Password) to generate
                time-based one-time codes.
              </p>
              <TotpEnrollWizard onDone={() => qc.invalidateQueries({ queryKey: ["iam-mfa-methods"] })} />
            </div>
          )}

          {/* WebAuthn */}
          {!webauthnMethod && (
            <WebAuthnEnrollCard
              onSyncDone={() => qc.invalidateQueries({ queryKey: ["iam-mfa-methods"] })}
            />
          )}
        </div>
      )}

      {/* Trusted Devices */}
      <TrustedDevicesPanel />

      {/* Security notes */}
      <div className="rounded-md bg-muted/40 px-4 py-3 space-y-1 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground text-xs">Security notes</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Removing a method requires re-entering your current authenticator code.</li>
          <li>Re-enrolling (replacing TOTP) also requires a live code from the existing method.</li>
          <li>MFA codes expire after 30 seconds. Keep your device clock synchronized.</li>
          <li>Step-up elevation (for admin actions) expires after 10 minutes.</li>
          <li>Trusted devices skip step-up challenges — revoke them if a device is lost or shared.</li>
          <li>Security key registration requires a redirect to the authentication portal.</li>
        </ul>
      </div>

      {/* Step-up challenge dialog (for method deletion) */}
      <StepUpDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        actionClass="security_change"
        onElevated={handleDeleteAfterElevation}
      />
    </div>
  );
}
