/**
 * Shared Keycloak admin utilities for athyper dev tools.
 *
 * Provides: KC_URL, REALM, ADMIN_USER, ADMIN_PASS, sleep, getToken, api, apiJson
 */

export const KC_URL     = "https://iam.mesh.athyper.local";
export const REALM      = "athyper";
export const ADMIN_USER = "athyperadmin";
export const ADMIN_PASS = "athyperadmin";

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function getToken(retries = 15, delayMs = 5000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(
        `${KC_URL}/realms/master/protocol/openid-connect/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id:  "admin-cli",
            username:   ADMIN_USER,
            password:   ADMIN_PASS,
            grant_type: "password",
          }),
        },
      );
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch {
        throw new Error("Non-JSON response (Keycloak not ready): " + text.slice(0, 120));
      }
      if (!data.access_token) throw new Error("No token: " + JSON.stringify(data));
      return data.access_token;
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`  Keycloak not ready (attempt ${attempt}/${retries}): ${err.message}`);
      await sleep(delayMs);
    }
  }
}

/**
 * Raw KC admin API call — returns the Response object.
 * @param {string} token
 * @param {string} path  — path relative to /admin/realms/{REALM}
 * @param {string} [method]
 * @param {unknown} [body]
 */
export function api(token, path, method = "GET", body) {
  const opts = {
    method,
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(`${KC_URL}/admin/realms/${REALM}${path}`, opts);
}

/**
 * KC admin API call — throws on non-2xx, returns parsed JSON (or null for empty body).
 * @param {string} token
 * @param {string} path
 * @param {string} [method]
 * @param {unknown} [body]
 */
export async function apiJson(token, path, method = "GET", body) {
  const res = await api(token, path, method, body);
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}
