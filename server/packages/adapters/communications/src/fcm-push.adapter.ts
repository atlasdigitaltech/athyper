import { createSign } from "node:crypto";
import type { PushTransport } from "@athyper/server-contract-notifications";

export interface FcmPushAdapterConfig {
  readonly projectId: string;
  readonly clientEmail: string;
  readonly privateKey: string;
  readonly tokenUri?: string;
  readonly timeoutMs?: number;
}

export interface FcmPushAdapterDependencies {
  readonly fetch: typeof fetch;
  readonly now?: () => number;
}

export function createFcmPushAdapter(
  config: FcmPushAdapterConfig,
  dependencies: FcmPushAdapterDependencies = { fetch: globalThis.fetch },
): PushTransport {
  const projectId = required(config.projectId, "FCM project ID");
  const clientEmail = required(config.clientEmail, "FCM client email");
  const privateKey = required(config.privateKey, "FCM private key").replace(/\\n/g, "\n");
  const tokenUri = config.tokenUri?.trim() || "https://oauth2.googleapis.com/token";
  const timeoutMs = config.timeoutMs ?? 10_000;
  const now = dependencies.now ?? Date.now;
  let cachedToken: { value: string; expiresAt: number } | undefined;

  const accessToken = async (): Promise<string> => {
    if (cachedToken && cachedToken.expiresAt > now() + 60_000) return cachedToken.value;
    const issuedAt = Math.floor(now() / 1_000);
    const assertion = signJwt(
      { alg: "RS256", typ: "JWT" },
      {
        iss: clientEmail,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: tokenUri,
        iat: issuedAt,
        exp: issuedAt + 3_600,
      },
      privateKey,
    );
    const response = await dependencies.fetch(tokenUri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`FCM token exchange failed with HTTP ${response.status}`);
    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== "string") throw new Error("FCM token response is invalid");
    const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 3_600;
    cachedToken = { value: body.access_token, expiresAt: now() + expiresIn * 1_000 };
    return body.access_token;
  };

  return {
    platforms: ["android", "ios"],
    async send(subscription, message) {
      if (!subscription.deviceToken) throw new Error("FCM subscription has no device token");
      const response = await dependencies.fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await accessToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: subscription.deviceToken,
              ...(message.title || message.body
                ? { notification: { title: message.title ?? "", body: message.body ?? "" } }
                : {}),
              ...(message.data ? { data: message.data } : {}),
            },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
      const responseBody = (await response.json().catch(() => ({}))) as {
        name?: unknown;
        error?: { status?: unknown };
      };
      if (!response.ok) {
        if (response.status === 404 || responseBody.error?.status === "UNREGISTERED") {
          return { subscriptionExpired: true };
        }
        throw new Error(`FCM delivery failed with HTTP ${response.status}`);
      }
      return typeof responseBody.name === "string"
        ? { externalId: responseBody.name }
        : {};
    },
  };
}

function signJwt(
  header: Readonly<Record<string, unknown>>,
  claims: Readonly<Record<string, unknown>>,
  privateKey: string,
): string {
  const unsigned = `${encodeJson(header)}.${encodeJson(claims)}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey, "base64url");
  return `${unsigned}.${signature}`;
}

function encodeJson(value: Readonly<Record<string, unknown>>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function required(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}
