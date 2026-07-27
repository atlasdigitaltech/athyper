"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Notification, PlaneKey } from "@athyper/api-contracts";

export interface BffFetchInit extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export type BffFetch = <T = unknown>(path: string, init?: BffFetchInit) => Promise<T>;

export interface NotificationTarget {
  plane: PlaneKey;
  surface: string;
  entityCode?: string;
  entityId?: string;
  routeName?: string;
  parameters?: Record<string, string>;
}

export interface NotificationsClientConfig {
  plane: PlaneKey;
  fetch: BffFetch;
  navigate: (href: string) => void;
  resolveHref?: (notification: import("@athyper/api-contracts").Notification) => string | undefined;
  resolveTarget?: (target: NotificationTarget) => string | undefined;
  allowedCrossPlaneTargets?: readonly PlaneKey[];
  isHrefAllowed?: (href: string) => boolean;
  storageKeyPrefix?: string;
}

export interface CreateNotificationsClientConfigOptions {
  plane: PlaneKey;
  fetch: BffFetch;
  navigate: (href: string) => void;
  resolveEntityHref?: (notification: Notification) => string | undefined;
  resolveTarget?: (target: NotificationTarget) => string | undefined;
  allowedCrossPlaneTargets?: readonly PlaneKey[];
  isHrefAllowed?: (href: string) => boolean;
  storageKeyPrefix?: string;
}

export function notificationEntityHref(
  notification: Pick<Notification, "entity_type" | "entity_id">,
): string | undefined {
  if (!notification.entity_type || !notification.entity_id) return undefined;
  return `/app/${encodeURIComponent(notification.entity_type)}/${encodeURIComponent(notification.entity_id)}`;
}

export function createNotificationsClientConfig(
  options: CreateNotificationsClientConfigOptions,
): NotificationsClientConfig {
  return {
    plane: options.plane,
    fetch: options.fetch,
    navigate: options.navigate,
    resolveHref: (notification) => {
      const href = resolveNotificationHref({ ...options, notification });
      return href && (!options.isHrefAllowed || options.isHrefAllowed(href)) ? href : undefined;
    },
    resolveTarget: options.resolveTarget,
    allowedCrossPlaneTargets: options.allowedCrossPlaneTargets,
    ...(options.storageKeyPrefix
      ? { storageKeyPrefix: options.storageKeyPrefix }
      : {}),
  };
}

export function notificationTarget(notification: Notification): NotificationTarget | undefined {
  const value = notification.payload["target"];
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const target = value as Record<string, unknown>;
  if (
    (target["plane"] !== "neon" && target["plane"] !== "mesh" && target["plane"] !== "admin")
    || typeof target["surface"] !== "string"
  ) return undefined;
  return {
    plane: target["plane"],
    surface: target["surface"],
    ...(typeof target["entityCode"] === "string" ? { entityCode: target["entityCode"] } : {}),
    ...(typeof target["entityId"] === "string" ? { entityId: target["entityId"] } : {}),
    ...(typeof target["routeName"] === "string" ? { routeName: target["routeName"] } : {}),
    ...(isStringRecord(target["parameters"]) ? { parameters: target["parameters"] } : {}),
  };
}

export function resolveNotificationHref({
  notification,
  plane,
  resolveTarget,
  resolveEntityHref,
  allowedCrossPlaneTargets = [],
}: Pick<CreateNotificationsClientConfigOptions, "plane" | "resolveTarget" | "resolveEntityHref" | "allowedCrossPlaneTargets"> & {
  notification: Notification;
}): string | undefined {
  const target = notificationTarget(notification);
  if (target) {
    if (target.plane !== plane && !allowedCrossPlaneTargets.includes(target.plane)) return undefined;
    return safeAppHref(resolveTarget?.(target) ?? defaultTargetHref(target));
  }
  return safeAppHref(notification.action_url ?? resolveEntityHref?.(notification));
}

function defaultTargetHref(target: NotificationTarget): string | undefined {
  if (target.entityCode && target.entityId) {
    return `/app/${encodeURIComponent(target.entityCode)}/${encodeURIComponent(target.entityId)}`;
  }
  const routes: Record<string, string> = {
    dashboard: "/dashboard",
    inbox: "/inbox",
    notifications: "/notifications",
    settings: "/settings",
    content: "/content",
    governance: "/governance",
    workbench: "/workbench",
  };
  return target.routeName ? routes[target.routeName] : routes[target.surface];
}

function safeAppHref(value: string | undefined): string | undefined {
  return value?.startsWith("/") && !value.startsWith("//") ? value : undefined;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every((item) => typeof item === "string");
}

const NotificationsConfigContext = createContext<NotificationsClientConfig | null>(null);

export function NotificationsClientProvider({
  config,
  children,
}: {
  config: NotificationsClientConfig;
  children: ReactNode;
}) {
  return (
    <NotificationsConfigContext.Provider value={config}>
      {children}
    </NotificationsConfigContext.Provider>
  );
}

export function useNotificationsConfig(): NotificationsClientConfig {
  const config = useContext(NotificationsConfigContext);
  if (!config) throw new Error("NotificationsClientProvider is required.");
  return config;
}

export function notificationStorageKey(config: NotificationsClientConfig, suffix: string): string {
  return `${config.storageKeyPrefix ?? "athyper"}_${config.plane}_push_${suffix}`;
}
