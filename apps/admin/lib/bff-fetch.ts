"use client";

import { getPlaneConfig } from "@athyper/session-plane";
import { PLANE_KEY } from "./plane";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const cookieName = getPlaneConfig(PLANE_KEY).csrfCookieName;
  const escapedName = cookieName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escapedName}=([^;]+)`));
  return match ? decodeURIComponent(match[1] ?? "") : "";
}

export function csrfFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  if (!MUTATING_METHODS.has(method)) return fetch(input, init);

  const headers = new Headers(init.headers);
  const token = getCsrfToken();
  if (token) headers.set("X-CSRF-Token", token);

  return fetch(input, { ...init, headers });
}
