"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getVapidKey,
  registerPushSubscription,
  unregisterPushSubscription,
} from "../client/push-api";
import { notificationStorageKey, useNotificationsConfig } from "../config";

export type PushSubscriptionStatus =
  | "idle" | "requesting" | "unsubscribing" | "subscribed"
  | "denied" | "unsupported" | "unconfigured" | "error";

function base64Key(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${"=".repeat((4 - value.length % 4) % 4)}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = window.atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function supported(): boolean {
  return typeof window !== "undefined"
    && "Notification" in window
    && "serviceWorker" in navigator
    && "PushManager" in window;
}

export function usePushSubscription() {
  const config = useNotificationsConfig();
  const [status, setStatus] = useState<PushSubscriptionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [publicKey, setPublicKey] = useState("");

  const refresh = useCallback(async () => {
    if (!supported()) {
      setStatus("unsupported");
      return;
    }
    try {
      const response = await getVapidKey(config.fetch);
      setConfigured(response.data.configured);
      setPublicKey(response.data.public_key);
      if (!response.data.configured) {
        setStatus("unconfigured");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const subscription = await registration.pushManager.getSubscription();
      setStatus(subscription ? "subscribed" : Notification.permission === "denied" ? "denied" : "idle");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to inspect push configuration.");
      setStatus("error");
    }
  }, [config.fetch]);

  const subscribe = useCallback(async () => {
    if (!supported()) return setStatus("unsupported");
    setStatus("requesting");
    setError(null);
    try {
      const vapid = configured && publicKey
        ? { configured, publicKey }
        : await getVapidKey(config.fetch).then((response) => ({
            configured: response.data.configured,
            publicKey: response.data.public_key,
          }));
      if (!vapid.configured || !vapid.publicKey) return setStatus("unconfigured");

      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setStatus(permission === "denied" ? "denied" : "idle");
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64Key(vapid.publicKey),
      });
      const json = subscription.toJSON();
      const deviceKey = notificationStorageKey(config, "device_id");
      const subscriptionKey = notificationStorageKey(config, "subscription_id");
      let deviceId = localStorage.getItem(deviceKey);
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem(deviceKey, deviceId);
      }
      const response = await registerPushSubscription(config.fetch, {
        platform: "web",
        device_id: deviceId,
        endpoint: json.endpoint,
        p256dh_key: json.keys?.p256dh,
        auth_key: json.keys?.auth,
        user_agent: navigator.userAgent,
      });
      if (response.data.id) localStorage.setItem(subscriptionKey, response.data.id);
      setStatus("subscribed");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to enable push notifications.");
      setStatus("error");
    }
  }, [config, configured, publicKey]);

  const unsubscribe = useCallback(async () => {
    setStatus("unsubscribing");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      await (await registration?.pushManager.getSubscription())?.unsubscribe();
      const key = notificationStorageKey(config, "subscription_id");
      const id = localStorage.getItem(key);
      if (id) await unregisterPushSubscription(config.fetch, id);
      localStorage.removeItem(key);
      setStatus("idle");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to disable push notifications.");
      setStatus("error");
    }
  }, [config]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { status, error, configured, subscribe, unsubscribe, refresh };
}
