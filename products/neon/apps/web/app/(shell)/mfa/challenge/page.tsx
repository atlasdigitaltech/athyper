"use client";

import { AlertTriangle, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function MfaChallengePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") ?? "/";

  const [code, setCode] = useState("");
  const [isBackupCode, setIsBackupCode] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(
    null,
  );

  const handleVerify = useCallback(async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);

    try {
      // Read CSRF token from the __csrf cookie
      const csrfToken = document.cookie
        .split("; ")
        .find((c) => c.startsWith("__csrf="))
        ?.split("=")[1];

      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({
          code: code.trim(),
          isBackupCode,
          rememberDevice,
        }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        reason?: string;
        remainingAttempts?: number;
        lockedUntil?: string;
      };

      if (res.ok && data.success) {
        router.push(returnUrl);
        return;
      }

      setError(data.reason ?? "Verification failed. Please try again.");
      if (data.remainingAttempts != null) {
        setRemainingAttempts(data.remainingAttempts);
      }
      if (data.lockedUntil) {
        setError(
          `Too many attempts. Locked until ${new Date(data.lockedUntil).toLocaleTimeString()}.`,
        );
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [code, isBackupCode, rememberDevice, returnUrl, router]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleVerify();
    },
    [handleVerify],
  );

  return (
    <div className="flex min-h-[80vh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="size-6 text-primary" />
          </div>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <CardDescription>
            {isBackupCode
              ? "Enter one of your backup codes to verify your identity."
              : "Enter the 6-digit code from your authenticator app."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3">
              <AlertTriangle className="size-4 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {remainingAttempts != null && remainingAttempts <= 3 && (
            <p className="text-center text-xs text-amber-600">
              {remainingAttempts} attempt{remainingAttempts !== 1 ? "s" : ""}{" "}
              remaining
            </p>
          )}

          <div>
            <Input
              type="text"
              inputMode={isBackupCode ? "text" : "numeric"}
              pattern={isBackupCode ? undefined : "[0-9]*"}
              maxLength={isBackupCode ? 9 : 6}
              placeholder={isBackupCode ? "XXXX-XXXX" : "000000"}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              className="text-center text-lg tracking-widest"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rememberDevice}
              onChange={(e) => setRememberDevice(e.target.checked)}
              className="rounded border-input"
            />
            Trust this device for 30 days
          </label>

          <Button
            className="w-full gap-2"
            onClick={handleVerify}
            disabled={loading || !code.trim()}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <KeyRound className="size-4" />
            )}
            {loading ? "Verifying..." : "Verify"}
          </Button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setIsBackupCode(!isBackupCode);
                setCode("");
                setError(null);
              }}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              {isBackupCode
                ? "Use authenticator app instead"
                : "Use a backup code"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
