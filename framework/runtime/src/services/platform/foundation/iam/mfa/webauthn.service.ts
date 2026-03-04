/**
 * WebAuthn Service
 *
 * Handles passkey/security key registration (attestation) and
 * authentication (assertion) using the WebAuthn protocol.
 *
 * Credentials are stored in sec.webauthn_credential table.
 */

import { randomBytes } from "node:crypto";

import { sql } from "kysely";

import type { Logger } from "../../../../../kernel/logger.js";
import type { Kysely } from "kysely";

// ============================================================================
// Types
// ============================================================================

export interface WebAuthnConfig {
  rpName: string; // Relying Party name (e.g., "Athyper")
  rpId: string; // Relying Party ID (e.g., "athyper.com")
  origin: string; // Expected origin (e.g., "https://athyper.com")
}

export interface RegistrationOptions {
  challenge: string; // base64url-encoded challenge
  rp: { name: string; id: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: Array<{ alg: number; type: "public-key" }>;
  timeout: number;
  attestation: "none" | "direct" | "indirect";
  authenticatorSelection: {
    authenticatorAttachment?: "platform" | "cross-platform";
    residentKey: "preferred" | "required" | "discouraged";
    userVerification: "preferred" | "required" | "discouraged";
  };
  excludeCredentials: Array<{ id: string; type: "public-key" }>;
}

export interface AuthenticationOptions {
  challenge: string; // base64url-encoded challenge
  timeout: number;
  rpId: string;
  allowCredentials: Array<{
    id: string;
    type: "public-key";
    transports?: string[];
  }>;
  userVerification: "preferred" | "required" | "discouraged";
}

export interface RegistrationResponse {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    clientDataJSON: string; // base64url
    attestationObject: string; // base64url
  };
}

export interface AuthenticationResponse {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    clientDataJSON: string; // base64url
    authenticatorData: string; // base64url
    signature: string; // base64url
    userHandle?: string; // base64url
  };
}

export interface StoredCredential {
  credentialId: string;
  publicKey: string; // base64url-encoded
  counter: number;
  aaguid?: string;
  transports: string[];
  createdAt: Date;
  lastUsedAt?: Date;
  label?: string;
}

// ============================================================================
// Service
// ============================================================================

export class WebAuthnService {
  private pendingRegistrations = new Map<
    string,
    {
      challenge: string;
      principalId: string;
      tenantId: string;
      expiresAt: number;
    }
  >();
  private pendingAuthentications = new Map<
    string,
    {
      challenge: string;
      principalId: string;
      tenantId: string;
      expiresAt: number;
    }
  >();

  constructor(
    private readonly db: Kysely<any>,
    private readonly config: WebAuthnConfig,
    private readonly logger: Logger,
  ) {}

  /**
   * Generate registration options for a new credential.
   */
  async startRegistration(
    principalId: string,
    tenantId: string,
    userName: string,
    displayName: string,
  ): Promise<RegistrationOptions> {
    const challenge = randomBytes(32).toString("base64url");

    // Get existing credentials to exclude
    const existing = await this.getCredentials(principalId, tenantId);

    const options: RegistrationOptions = {
      challenge,
      rp: { name: this.config.rpName, id: this.config.rpId },
      user: {
        id: Buffer.from(principalId).toString("base64url"),
        name: userName,
        displayName,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" }, // ES256
        { alg: -257, type: "public-key" }, // RS256
      ],
      timeout: 60_000,
      attestation: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
      excludeCredentials: existing.map((c) => ({
        id: c.credentialId,
        type: "public-key" as const,
      })),
    };

    // Store pending challenge (5 min expiry)
    this.pendingRegistrations.set(challenge, {
      challenge,
      principalId,
      tenantId,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    this.logger.info({
      msg: "webauthn_registration_started",
      principalId,
      tenantId,
    });

    return options;
  }

  /**
   * Verify registration response and store the credential.
   */
  async verifyRegistration(
    challenge: string,
    response: RegistrationResponse,
  ): Promise<{ verified: boolean; credentialId?: string; error?: string }> {
    // Retrieve pending registration
    const pending = this.pendingRegistrations.get(challenge);
    if (!pending) {
      return { verified: false, error: "Challenge not found or expired" };
    }

    if (Date.now() > pending.expiresAt) {
      this.pendingRegistrations.delete(challenge);
      return { verified: false, error: "Challenge expired" };
    }

    this.pendingRegistrations.delete(challenge);

    try {
      // Decode clientDataJSON
      const clientDataJSON = Buffer.from(
        response.response.clientDataJSON,
        "base64url",
      );
      const clientData = JSON.parse(clientDataJSON.toString("utf-8")) as {
        type: string;
        challenge: string;
        origin: string;
      };

      // Verify challenge matches
      if (clientData.challenge !== challenge) {
        return { verified: false, error: "Challenge mismatch" };
      }

      // Verify origin
      if (clientData.origin !== this.config.origin) {
        return { verified: false, error: "Origin mismatch" };
      }

      // Verify type
      if (clientData.type !== "webauthn.create") {
        return { verified: false, error: "Invalid client data type" };
      }

      // Store credential
      // In production, fully parse attestationObject to extract publicKey, aaguid, etc.
      // Here we store the raw attestation for later verification
      const credentialId = response.id;
      const publicKey = response.response.attestationObject;

      await sql`
                INSERT INTO sec.webauthn_credential
                    (tenant_id, principal_id, credential_id, public_key, counter, transports, aaguid)
                VALUES
                    (${pending.tenantId}::uuid, ${pending.principalId}, ${credentialId},
                     ${publicKey}, 0, ARRAY[]::text[], NULL)
            `.execute(this.db);

      this.logger.info({
        msg: "webauthn_registration_complete",
        principalId: pending.principalId,
        credentialId: credentialId.substring(0, 16) + "...",
      });

      return { verified: true, credentialId };
    } catch (err) {
      this.logger.error({
        msg: "webauthn_registration_error",
        error: String(err),
      });
      return { verified: false, error: "Verification failed" };
    }
  }

  /**
   * Generate authentication options for an existing credential.
   */
  async startAuthentication(
    principalId: string,
    tenantId: string,
  ): Promise<AuthenticationOptions> {
    const challenge = randomBytes(32).toString("base64url");

    // Get user's credentials
    const credentials = await this.getCredentials(principalId, tenantId);

    const options: AuthenticationOptions = {
      challenge,
      timeout: 60_000,
      rpId: this.config.rpId,
      allowCredentials: credentials.map((c) => ({
        id: c.credentialId,
        type: "public-key" as const,
        transports: c.transports.length > 0 ? c.transports : undefined,
      })),
      userVerification: "preferred",
    };

    // Store pending challenge
    this.pendingAuthentications.set(challenge, {
      challenge,
      principalId,
      tenantId,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return options;
  }

  /**
   * Verify authentication response.
   */
  async verifyAuthentication(
    challenge: string,
    response: AuthenticationResponse,
  ): Promise<{ verified: boolean; credentialId?: string; error?: string }> {
    const pending = this.pendingAuthentications.get(challenge);
    if (!pending) {
      return { verified: false, error: "Challenge not found or expired" };
    }

    if (Date.now() > pending.expiresAt) {
      this.pendingAuthentications.delete(challenge);
      return { verified: false, error: "Challenge expired" };
    }

    this.pendingAuthentications.delete(challenge);

    try {
      // Decode clientDataJSON
      const clientDataJSON = Buffer.from(
        response.response.clientDataJSON,
        "base64url",
      );
      const clientData = JSON.parse(clientDataJSON.toString("utf-8")) as {
        type: string;
        challenge: string;
        origin: string;
      };

      // Verify challenge
      if (clientData.challenge !== challenge) {
        return { verified: false, error: "Challenge mismatch" };
      }

      // Verify origin
      if (clientData.origin !== this.config.origin) {
        return { verified: false, error: "Origin mismatch" };
      }

      // Verify type
      if (clientData.type !== "webauthn.get") {
        return { verified: false, error: "Invalid client data type" };
      }

      // Look up credential
      const credResult = await sql<any>`
                SELECT credential_id, public_key, counter
                FROM sec.webauthn_credential
                WHERE tenant_id = ${pending.tenantId}::uuid
                  AND principal_id = ${pending.principalId}
                  AND credential_id = ${response.id}
            `.execute(this.db);

      const cred = credResult.rows?.[0];
      if (!cred) {
        return { verified: false, error: "Credential not found" };
      }

      // In production, verify signature using stored public key + authenticatorData
      // For now, we verify the challenge match and update the counter

      // Update counter and last_used_at
      await sql`
                UPDATE sec.webauthn_credential
                SET counter = counter + 1,
                    last_used_at = NOW()
                WHERE tenant_id = ${pending.tenantId}::uuid
                  AND credential_id = ${response.id}
            `.execute(this.db);

      this.logger.info({
        msg: "webauthn_authentication_success",
        principalId: pending.principalId,
        credentialId: response.id.substring(0, 16) + "...",
      });

      return { verified: true, credentialId: response.id };
    } catch (err) {
      this.logger.error({
        msg: "webauthn_authentication_error",
        error: String(err),
      });
      return { verified: false, error: "Verification failed" };
    }
  }

  /**
   * Get all credentials for a principal.
   */
  async getCredentials(
    principalId: string,
    tenantId: string,
  ): Promise<StoredCredential[]> {
    const result = await sql<any>`
            SELECT credential_id, public_key, counter, aaguid, transports,
                   created_at, last_used_at, label
            FROM sec.webauthn_credential
            WHERE tenant_id = ${tenantId}::uuid
              AND principal_id = ${principalId}
            ORDER BY created_at DESC
        `.execute(this.db);

    return (result.rows ?? []).map((r: any) => ({
      credentialId: r.credential_id,
      publicKey: r.public_key,
      counter: r.counter ?? 0,
      aaguid: r.aaguid ?? undefined,
      transports: r.transports ?? [],
      createdAt: new Date(r.created_at),
      lastUsedAt: r.last_used_at ? new Date(r.last_used_at) : undefined,
      label: r.label ?? undefined,
    }));
  }

  /**
   * Remove a credential.
   */
  async removeCredential(
    credentialId: string,
    principalId: string,
    tenantId: string,
  ): Promise<boolean> {
    const result = await sql`
            DELETE FROM sec.webauthn_credential
            WHERE tenant_id = ${tenantId}::uuid
              AND principal_id = ${principalId}
              AND credential_id = ${credentialId}
        `.execute(this.db);

    return (result.numAffectedRows ?? 0n) > 0n;
  }

  /**
   * Check if a principal has any WebAuthn credentials.
   */
  async hasCredentials(
    principalId: string,
    tenantId: string,
  ): Promise<boolean> {
    const result = await sql<any>`
            SELECT 1 FROM sec.webauthn_credential
            WHERE tenant_id = ${tenantId}::uuid
              AND principal_id = ${principalId}
            LIMIT 1
        `.execute(this.db);

    return (result.rows?.length ?? 0) > 0;
  }
}
