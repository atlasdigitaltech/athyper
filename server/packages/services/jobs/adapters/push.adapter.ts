/**
 * Push Channel Adapter — FCM HTTP v1 (Android/iOS) + VAPID Web Push (browser)
 *
 * Registered in bootstrap.ts under channel key "push" when config.push is present.
 *
 * For each send() call (recipient = one principal):
 *   1. Queries event.push_subscription for all active subscriptions for this principal
 *   2. For web subscriptions: sends VAPID-authenticated Web Push (empty ping)
 *   3. For android/ios subscriptions: sends FCM HTTP v1 message
 *
 * FCM config (PUSH_FCM_PROJECT_ID + PUSH_FCM_SERVICE_ACCOUNT_KEY env vars):
 *   fcmProjectId            — Firebase project ID
 *   fcmServiceAccountKeyJson — JSON string of service account key file
 *
 * VAPID config (VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY + VAPID_SUBJECT env vars):
 *   vapidPublicKey  — base64url-encoded uncompressed P-256 public key (65 bytes)
 *   vapidPrivateKey — base64url-encoded raw P-256 private key (32 bytes)
 *   vapidSubject    — "mailto:..." or "https://..." URI for VAPID JWT sub claim
 *
 * Web Push sends an empty ping (no content encryption). The service worker
 * fetches the latest notification via /api/notifications on receipt.
 *
 * FCM uses HTTP v1 with a short-lived OAuth2 access token obtained from the
 * service account key via a RS256 JWT assertion (no firebase-admin SDK needed).
 *
 * Health check:
 *   - FCM configured: verifies service account token exchange
 *   - VAPID only: validates local key material
 */

import { createPrivateKey, createSign } from "node:crypto";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { NotificationChannelHandler } from "../workers/notification.worker.js";
import { SYSTEM_ACTOR_ID } from "../jobs.types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = Kysely<Record<string, any>>;

// ── Config ────────────────────────────────────────────────────────────────────

export interface PushAdapterConfig {
  /** Firebase project ID (required for FCM Android/iOS push) */
  fcmProjectId?:            string;
  /** JSON string of GCP service account key file */
  fcmServiceAccountKeyJson?: string;

  /** "mailto:..." or "https://..." URI for VAPID JWT "sub" claim */
  vapidSubject?:    string;
  /** base64url-encoded uncompressed P-256 public key (65 bytes → 88 chars) */
  vapidPublicKey?:  string;
  /** base64url-encoded raw P-256 private key (32 bytes → 43 chars) */
  vapidPrivateKey?: string;
  /** Optional logger for per-subscription warnings */
  logger?: { warn(event: string, fields?: Record<string, unknown>): void };
}

// ── Internal types ────────────────────────────────────────────────────────────

interface FcmServiceAccountKey {
  private_key:  string;  // PEM-encoded RSA private key
  client_email: string;
}

interface PushSubscriptionRow {
  id:           string;
  platform:     "web" | "android" | "ios";
  endpoint:     string | null;
  device_token: string | null;
}

interface AccessTokenCache {
  token:     string;
  expiresAt: number;  // Date.now() ms
}

interface VapidJwtCache {
  jwt:       string;
  expiresAt: number;  // Date.now() ms
}

const VAPID_JWT_TTL_SECONDS = 21_600;  // 6h; below Firefox's 12h upper bound.
const VAPID_JWT_CACHE_SKEW_MS = 60_000;

class ExpiredWebPushSubscriptionError extends Error {
  constructor(readonly status: number) {
    super(`Web push endpoint expired (HTTP ${status})`);
    this.name = "ExpiredWebPushSubscriptionError";
  }
}

// ── Key conversion ────────────────────────────────────────────────────────────

// PKCS8 DER header for a raw EC P-256 private key.
// Validated bytes:
//   SEQUENCE {
//     INTEGER (version=0)
//     SEQUENCE { OID ecPublicKey  OID P-256 }
//     OCTET STRING {
//       SEQUENCE {
//         INTEGER (version=1)
//         OCTET STRING [32 bytes of raw key]
//       }
//     }
//   }
// Total DER = 35 bytes header + 32 bytes key = 67 bytes.
const EC_P256_PKCS8_HEADER = Buffer.from(
  "3041020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420",
  "hex",
);

function rawEcKeyToPkcs8Pem(rawKey: Buffer): string {
  if (rawKey.length !== 32) {
    throw new Error(`EC P-256 raw key must be 32 bytes, got ${rawKey.length}`);
  }
  const der = Buffer.concat([EC_P256_PKCS8_HEADER, rawKey]);
  const b64 = der.toString("base64");
  const lines = (b64.match(/.{1,64}/g) ?? [b64]).join("\n");
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`;
}

// ── JWT signing ───────────────────────────────────────────────────────────────

function base64urlEncode(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64url");
}

function buildJwt(
  header:  object,
  payload: object,
  signFn:  (signingInput: string) => Buffer,
): string {
  const h = base64urlEncode(JSON.stringify(header));
  const p = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${h}.${p}`;
  const sig = signFn(signingInput);
  return `${signingInput}.${base64urlEncode(sig)}`;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createPushAdapter(config: PushAdapterConfig, db: DB): NotificationChannelHandler {

  // ── VAPID private key → PEM (done once at construction) ───────────────────
  let vapidPrivateKeyPem: string | null = null;
  if (config.vapidPrivateKey) {
    const raw = Buffer.from(config.vapidPrivateKey, "base64url");
    vapidPrivateKeyPem = rawEcKeyToPkcs8Pem(raw);
  }

  // ── FCM service account key ────────────────────────────────────────────────
  let fcmSaKey: FcmServiceAccountKey | null = null;
  if (config.fcmServiceAccountKeyJson) {
    fcmSaKey = JSON.parse(config.fcmServiceAccountKeyJson) as FcmServiceAccountKey;
  }

  // ── FCM access token cache ─────────────────────────────────────────────────
  let fcmTokenCache: AccessTokenCache | null = null;
  const vapidJwtCache = new Map<string, VapidJwtCache>();

  async function getFcmAccessToken(): Promise<string> {
    if (fcmTokenCache && Date.now() < fcmTokenCache.expiresAt) {
      return fcmTokenCache.token;
    }
    if (!fcmSaKey) throw new Error("FCM service account key not configured");

    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3_600;

    const jwt = buildJwt(
      { alg: "RS256", typ: "JWT" },
      {
        iss:   fcmSaKey.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud:   "https://oauth2.googleapis.com/token",
        iat,
        exp,
      },
      (input) => {
        const signer = createSign("SHA256");
        signer.update(input);
        return signer.sign(fcmSaKey!.private_key);
      },
    );

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion:  jwt,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`FCM token exchange failed: HTTP ${res.status} — ${txt.slice(0, 200)}`);
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    fcmTokenCache = {
      token:     data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1_000,  // 60s safety buffer
    };
    return fcmTokenCache.token;
  }

  // ── FCM send ───────────────────────────────────────────────────────────────

  async function sendFcm(opts: {
    deviceToken:  string;
    title:        string;
    body:         string;
    data?:        Record<string, string>;
  }): Promise<string> {
    const accessToken = await getFcmAccessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${config.fcmProjectId}/messages:send`;

    const res = await fetch(url, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type":  "application/json",
      },
      body:   JSON.stringify({
        message: {
          token:        opts.deviceToken,
          notification: { title: opts.title, body: opts.body },
          ...(opts.data ? { data: opts.data } : {}),
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`FCM send failed: HTTP ${res.status} — ${txt.slice(0, 200)}`);
    }

    const result = (await res.json()) as { name: string };
    return result.name;  // "projects/{projectId}/messages/{messageId}"
  }

  // ── VAPID Web Push (empty ping) ────────────────────────────────────────────

  function getVapidJwt(endpointOrigin: string): string {
    if (!vapidPrivateKeyPem || !config.vapidPublicKey || !config.vapidSubject) {
      throw new Error("vapidPrivateKey, vapidPublicKey, and vapidSubject are all required for web push");
    }

    const now = Date.now();
    const cached = vapidJwtCache.get(endpointOrigin);
    if (cached && cached.expiresAt > now + VAPID_JWT_CACHE_SKEW_MS) return cached.jwt;

    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + VAPID_JWT_TTL_SECONDS;

    const vapidJwt = buildJwt(
      { alg: "ES256", typ: "JWT" },
      { sub: config.vapidSubject, aud: endpointOrigin, iat, exp },
      (input) => {
        const signer = createSign("SHA256");
        signer.update(input);
        // ieee-p1363 (raw r||s, 64 bytes) is required for ES256 JWT signatures
        return signer.sign({
          key:         vapidPrivateKeyPem!,
          dsaEncoding: "ieee-p1363",
        });
      },
    );
    vapidJwtCache.set(endpointOrigin, {
      jwt:       vapidJwt,
      expiresAt: exp * 1000,
    });
    return vapidJwt;
  }

  async function sendWebPush(endpoint: string): Promise<void> {
    const endpointOrigin = new URL(endpoint).origin;
    const vapidJwt = getVapidJwt(endpointOrigin);

    const res = await fetch(endpoint, {
      method:  "POST",
      headers: {
        "Authorization": `vapid t=${vapidJwt},k=${config.vapidPublicKey}`,
        "TTL":           "86400",
        "Content-Length": "0",
      },
      signal: AbortSignal.timeout(10_000),
    });

    // 201 Created = queued successfully
    // 410 Gone / 404 = subscription expired — caller should deregister
    if (res.status === 410 || res.status === 404) {
      throw new ExpiredWebPushSubscriptionError(res.status);
    }
    if (!res.ok && res.status !== 201) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Web push failed: HTTP ${res.status} — ${txt.slice(0, 200)}`);
    }
  }

  // ── send() ─────────────────────────────────────────────────────────────────

  async function deactivateSubscription(subscriptionId: string): Promise<void> {
    await sql`
      UPDATE event.push_subscription
      SET    is_active  = false,
             expires_at = COALESCE(expires_at, now()),
             updated_at = now(),
             updated_by = ${SYSTEM_ACTOR_ID}::uuid
      WHERE  id = ${subscriptionId}::uuid
    `.execute(db);
  }

  return {
    async send(opts) {
      const { subject, templateKey, payload, tenantId, recipientId } = opts;

      // Push requires tenantId + recipientId (principal UUID) to look up subscriptions.
      // recipientId is passed from deliverOne(); fall back to recipientAddr if absent
      // (email addr is useless for push, but we'll proceed without subscriptions).
      const principalId = recipientId ?? opts.recipientAddr;

      if (!tenantId || !principalId) {
        throw new Error("Push adapter requires tenantId and recipientId in send() opts");
      }

      // Fetch all active push subscriptions for this principal
      const result = await sql<PushSubscriptionRow>`
        SELECT id, platform, endpoint, device_token
        FROM   event.push_subscription
        WHERE  tenant_id    = ${tenantId}::uuid
          AND  principal_id = ${principalId}::uuid
          AND  is_active    = true
          AND  (expires_at IS NULL OR expires_at > now())
      `.execute(db);

      const subscriptions = result.rows;
      if (subscriptions.length === 0) {
        // Principal has no active push subscriptions — treat as no-op
        return { externalId: undefined };
      }

      const title = typeof subject === "string" && subject
        ? subject
        : String(payload["title"] ?? templateKey);
      const body  = String(payload["rendered_text"] ?? payload["body"] ?? "");
      const data: Record<string, string> = { template_key: templateKey };

      let dispatched = 0;
      const errors: string[] = [];

      for (const sub of subscriptions) {
        try {
          if (sub.platform === "web" && sub.endpoint) {
            await sendWebPush(sub.endpoint);
            dispatched++;
          } else if (sub.platform === "android" && sub.device_token) {
            if (!fcmSaKey || !config.fcmProjectId) {
              errors.push(`FCM not configured — skipping subscription ${sub.id}`);
              continue;
            }
            await sendFcm({
              deviceToken: sub.device_token,
              title,
              body,
              data,
            });
            dispatched++;
          } else if (sub.platform === "ios") {
            config.logger?.warn("push_subscription_ios_skipped", {
              subscriptionId: sub.id,
              templateKey,
              reason: "apns_not_configured",
            });
            errors.push(`APNs push is not configured - skipping subscription ${sub.id}`);
          }
        } catch (err) {
          if (err instanceof ExpiredWebPushSubscriptionError) {
            await deactivateSubscription(sub.id);
            continue;
          }
          const errMsg = String(err).slice(0, 120);
          config.logger?.warn("push_subscription_send_failed", {
            subscriptionId: sub.id,
            platform: sub.platform,
            templateKey,
            err: errMsg,
          });
          errors.push(`sub ${sub.id}: ${errMsg}`);
        }
      }

      // Fail the job only if every subscription dispatch failed
      if (dispatched === 0 && errors.length > 0) {
        throw new Error(`Push delivery failed for all subscriptions: ${errors.join("; ")}`);
      }

      return {
        externalId: dispatched > 0 ? `dispatched:${dispatched}` : undefined,
      };
    },

    async healthCheck() {
      if (fcmSaKey && config.fcmProjectId) {
        try {
          await getFcmAccessToken();
          return "healthy";
        } catch {
          return "degraded";
        }
      }
      // VAPID-only mode: validate local key material; no external endpoint exists.
      if (config.vapidPublicKey || config.vapidPrivateKey || config.vapidSubject) {
        if (!vapidPrivateKeyPem || !config.vapidPublicKey || !config.vapidSubject) return "down";
        try {
          createPrivateKey(vapidPrivateKeyPem);
          return "healthy";
        } catch {
          return "degraded";
        }
      }
      return "healthy";
    },
  };
}
