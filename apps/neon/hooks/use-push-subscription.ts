"use client";

import { useCallback, useEffect, useState } from "react";
import { bffFetch } from "@/lib/bff-fetch";

export type PushSubscriptionStatus =
  | "idle"
  | "requesting"
  | "unsubscribing"
  | "subscribed"
  | "denied"
  | "unsupported"
  | "unconfigured"
  | "error";

type BrowserPermissionState = NotificationPermission | "unsupported";

interface VapidKeyResponse {
  data?: {
    public_key?: string;
    configured?: boolean;
  };
}

interface SubscribeResponse {
  data?: {
    id?: string;
  };
}

interface PushSubscriptionJson {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
}

interface PushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

const DEVICE_ID_STORAGE_KEY = "athyper_neon_push_device_id";
const SUBSCRIPTION_ID_STORAGE_KEY = "athyper_neon_push_subscription_id";

function hasPushSupport(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function hasUsableServiceWorkerContext(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.isSecureContext ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

function readPermission(): BrowserPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function getDeviceId(): string {
  const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) return existing;

  const id = typeof window.crypto?.randomUUID === "function"
    ? window.crypto.randomUUID()
    : `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
  return id;
}

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }

  return output;
}

function toBytes(source: BufferSource | null): Uint8Array | null {
  if (!source) return null;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
}

function sameApplicationServerKey(current: BufferSource | null, next: Uint8Array): boolean {
  const currentBytes = toBytes(current);
  if (!currentBytes) return true;
  if (currentBytes.byteLength !== next.byteLength) return false;

  for (let index = 0; index < currentBytes.byteLength; index += 1) {
    if (currentBytes[index] !== next[index]) return false;
  }

  return true;
}

function getSubscriptionPayload(subscription: PushSubscription): PushSubscriptionPayload {
  const json = subscription.toJSON() as PushSubscriptionJson;
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    throw new Error("Browser did not return a complete push subscription.");
  }

  return { endpoint, keys: { p256dh, auth } };
}

export function usePushSubscription() {
  const [status, setStatus] = useState<PushSubscriptionStatus>("idle");
  const [permission, setPermission] = useState<BrowserPermissionState>(() => readPermission());
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [isSecureContext, setIsSecureContext] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!hasPushSupport()) {
      setIsSupported(false);
      setPermission("unsupported");
      setStatus("unsupported");
      return;
    }

    setIsSupported(true);
    setPermission(readPermission());
    const canUseServiceWorker = hasUsableServiceWorkerContext();
    setIsSecureContext(canUseServiceWorker);

    if (!canUseServiceWorker) {
      setStatus("unsupported");
      setError("Browser push requires HTTPS or localhost.");
      return;
    }

    setError(null);

    try {
      const response = await bffFetch<VapidKeyResponse>("/api/notifications/push/vapid-key", { signal });
      const nextPublicKey = response.data?.public_key?.trim() ?? "";
      const nextConfigured = Boolean(response.data?.configured && nextPublicKey);
      setPublicKey(nextPublicKey || null);
      setConfigured(nextConfigured);

      const nextPermission = readPermission();
      setPermission(nextPermission);

      if (!nextConfigured) {
        setStatus("unconfigured");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

      if (nextPermission === "denied") {
        setStatus("denied");
        return;
      }
      if (nextPermission !== "granted") {
        setStatus("idle");
        return;
      }

      const subscription = await registration?.pushManager.getSubscription();
      setStatus(subscription ? "subscribed" : "idle");
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : "Unable to check push configuration.");
      setStatus("error");
    }
  }, []);

  const subscribe = useCallback(async () => {
    setError(null);

    if (!hasPushSupport()) {
      setIsSupported(false);
      setPermission("unsupported");
      setStatus("unsupported");
      return;
    }

    if (!hasUsableServiceWorkerContext()) {
      setIsSecureContext(false);
      setStatus("unsupported");
      setError("Browser push requires HTTPS or localhost.");
      return;
    }

    setStatus("requesting");

    try {
      let nextPublicKey = publicKey;
      let nextConfigured = configured;

      if (!nextConfigured || !nextPublicKey) {
        const response = await bffFetch<VapidKeyResponse>("/api/notifications/push/vapid-key");
        nextPublicKey = response.data?.public_key?.trim() ?? null;
        nextConfigured = Boolean(response.data?.configured && nextPublicKey);
        setPublicKey(nextPublicKey);
        setConfigured(nextConfigured);
      }

      if (!nextConfigured || !nextPublicKey) {
        setStatus("unconfigured");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);

      if (nextPermission !== "granted") {
        setStatus(nextPermission === "denied" ? "denied" : "idle");
        return;
      }

      const applicationServerKey = urlBase64ToUint8Array(nextPublicKey);
      let subscription = await registration.pushManager.getSubscription();

      if (
        subscription &&
        !sameApplicationServerKey(subscription.options.applicationServerKey, applicationServerKey)
      ) {
        await subscription.unsubscribe();
        subscription = null;
      }

      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      const payload = getSubscriptionPayload(subscription);
      const response = await bffFetch<SubscribeResponse>("/api/notifications/push/subscribe", {
        method: "POST",
        body: {
          platform: "web",
          device_id: getDeviceId(),
          endpoint: payload.endpoint,
          p256dh_key: payload.keys.p256dh,
          auth_key: payload.keys.auth,
          user_agent: window.navigator.userAgent,
        },
      });

      if (response.data?.id) {
        window.localStorage.setItem(SUBSCRIPTION_ID_STORAGE_KEY, response.data.id);
      }

      setStatus("subscribed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to enable browser push.");
      setStatus("error");
    }
  }, [configured, publicKey]);

  const unsubscribe = useCallback(async () => {
    setError(null);

    if (!hasPushSupport()) {
      setIsSupported(false);
      setPermission("unsupported");
      setStatus("unsupported");
      return;
    }

    setStatus("unsubscribing");

    try {
      const registration = await navigator.serviceWorker.getRegistration("/")
        ?? await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const subscription = await registration.pushManager.getSubscription();
      await subscription?.unsubscribe();

      const subscriptionId = window.localStorage.getItem(SUBSCRIPTION_ID_STORAGE_KEY);
      if (subscriptionId) {
        await bffFetch(`/api/notifications/push/subscribe/${encodeURIComponent(subscriptionId)}`, {
          method: "DELETE",
        });
      }

      window.localStorage.removeItem(SUBSCRIPTION_ID_STORAGE_KEY);
      setPermission(readPermission());
      setStatus("idle");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to disable browser push.");
      setStatus("error");
    }
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  return {
    status,
    permission,
    configured: configured ?? false,
    isConfiguredKnown: configured != null,
    isSupported,
    isSecureContext,
    error,
    subscribe,
    unsubscribe,
    refresh,
  };
}
