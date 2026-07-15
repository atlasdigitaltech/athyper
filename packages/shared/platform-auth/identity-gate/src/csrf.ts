import type { PlaneKey } from "@athyper/session-plane";
import { getPlaneConfig } from "@athyper/session-plane";

export function readCsrfToken(plane: PlaneKey): string | null {
  const cookieName = getPlaneConfig(plane).csrfCookieName;
  const escapedName = cookieName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escapedName}=([^;]+)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1] ?? "");
  } catch {
    // A malformed cookie should fail CSRF validation server-side, not crash the UI.
    return null;
  }
}

export function csrfHeaders(plane: PlaneKey): Record<string, string> {
  const token = readCsrfToken(plane);
  return token ? { "X-CSRF-Token": token } : {};
}
