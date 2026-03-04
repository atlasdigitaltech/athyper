/**
 * CrossTenantShareService — External sharing with tenant bridge tokens.
 *
 * Generates signed JWT tokens granting scoped access to specific records.
 * Tokens are read-only by default; all external access is audit-logged.
 */

import { createHash, randomBytes } from "node:crypto";

import { sql } from "kysely";

import type { ShareAuditService } from "./ShareAuditService.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type {
    ExternalShareToken,
    CreateExternalShareInput,
} from "../types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const DEFAULT_EXPIRY_DAYS = 7;
const MAX_EXPIRY_DAYS = 90;

export class CrossTenantShareService {
    constructor(
        private readonly db: Kysely<DB>,
        private readonly auditService: ShareAuditService,
        private readonly logger: Logger,
    ) {}

    /**
     * Create an external share token for a record.
     * Returns the raw token (shown once to user) and the stored metadata.
     */
    async createShareToken(
        input: CreateExternalShareInput,
    ): Promise<{ token: string; share: ExternalShareToken }> {
        const expiryDays = Math.min(input.expiresInDays ?? DEFAULT_EXPIRY_DAYS, MAX_EXPIRY_DAYS);
        const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

        // Generate a cryptographically random token
        const rawToken = randomBytes(32).toString("base64url");
        const tokenHash = createHash("sha256").update(rawToken).digest("hex");

        const result = await sql<any>`
            INSERT INTO collab.external_share_token
                (tenant_id, token_hash, issuer_tenant_id, issued_by, target_email,
                 entity_type, entity_id, permission_level, expires_at)
            VALUES
                (${input.tenantId}::uuid, ${tokenHash}, ${input.tenantId}::uuid,
                 ${input.issuedBy}, ${input.targetEmail},
                 ${input.entityType}, ${input.entityId},
                 ${input.permissionLevel ?? "view"}, ${expiresAt.toISOString()}::timestamptz)
            RETURNING *
        `.execute(this.db);

        const share = this.toDomain(result.rows[0]);

        await this.auditService.log({
            tenantId: input.tenantId,
            grantId: share.id,
            grantType: "external_share",
            action: "grant_created",
            actorId: input.issuedBy,
            targetId: input.targetEmail,
            entityType: input.entityType,
            entityId: input.entityId,
            details: {
                permissionLevel: input.permissionLevel ?? "view",
                expiresAt: expiresAt.toISOString(),
                expiryDays,
            },
        });

        this.logger.info(
            {
                shareId: share.id,
                entityType: input.entityType,
                entityId: input.entityId,
                targetEmail: this.redactEmail(input.targetEmail),
            },
            "[share:external] External share token created",
        );

        return { token: rawToken, share };
    }

    /**
     * Verify an external share token and record the access.
     * Returns the token metadata if valid, undefined if invalid/expired/revoked.
     */
    async verifyToken(rawToken: string): Promise<ExternalShareToken | undefined> {
        const tokenHash = createHash("sha256").update(rawToken).digest("hex");

        const result = await sql<any>`
            SELECT * FROM collab.external_share_token
            WHERE token_hash = ${tokenHash}
              AND is_revoked = false
              AND expires_at > NOW()
        `.execute(this.db);

        const row = result.rows?.[0];
        if (!row) return undefined;

        // Update access tracking
        await sql`
            UPDATE collab.external_share_token
            SET last_accessed_at = NOW(), access_count = access_count + 1
            WHERE id = ${row.id}::uuid
        `.execute(this.db);

        const share = this.toDomain(row);

        // Audit the external access
        await this.auditService.log({
            tenantId: share.tenantId,
            grantId: share.id,
            grantType: "external_share",
            action: "access_via_share",
            actorId: share.targetEmail,
            entityType: share.entityType,
            entityId: share.entityId,
            details: { accessCount: share.accessCount + 1 },
        });

        return share;
    }

    /**
     * Revoke an external share token.
     */
    async revokeToken(
        tenantId: string,
        tokenId: string,
        revokedBy: string,
    ): Promise<boolean> {
        const result = await sql<any>`
            UPDATE collab.external_share_token
            SET is_revoked = true, revoked_at = NOW()
            WHERE tenant_id = ${tenantId}::uuid AND id = ${tokenId}::uuid AND is_revoked = false
            RETURNING id, entity_type, entity_id, target_email
        `.execute(this.db);

        const row = result.rows?.[0];
        if (!row) return false;

        await this.auditService.log({
            tenantId,
            grantId: tokenId,
            grantType: "external_share",
            action: "grant_revoked",
            actorId: revokedBy,
            targetId: row.target_email,
            entityType: row.entity_type,
            entityId: row.entity_id,
        });

        this.logger.info(
            { tokenId, revokedBy },
            "[share:external] External share token revoked",
        );

        return true;
    }

    /**
     * List external share tokens for an entity.
     */
    async listForEntity(
        tenantId: string,
        entityType: string,
        entityId: string,
    ): Promise<ExternalShareToken[]> {
        const result = await sql<any>`
            SELECT * FROM collab.external_share_token
            WHERE tenant_id = ${tenantId}::uuid
              AND entity_type = ${entityType}
              AND entity_id = ${entityId}
              AND is_revoked = false
            ORDER BY created_at DESC
        `.execute(this.db);

        return (result.rows ?? []).map((r: any) => this.toDomain(r));
    }

    private toDomain(row: any): ExternalShareToken {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            tokenHash: row.token_hash,
            issuerTenantId: row.issuer_tenant_id,
            issuedBy: row.issued_by,
            targetEmail: row.target_email,
            entityType: row.entity_type,
            entityId: row.entity_id,
            permissionLevel: row.permission_level,
            expiresAt: new Date(row.expires_at),
            isRevoked: row.is_revoked,
            revokedAt: row.revoked_at ? new Date(row.revoked_at) : undefined,
            lastAccessedAt: row.last_accessed_at ? new Date(row.last_accessed_at) : undefined,
            accessCount: row.access_count ?? 0,
            createdAt: new Date(row.created_at),
        };
    }

    private redactEmail(email: string): string {
        const [local, domain] = email.split("@");
        if (!domain) return "***";
        return `${local[0]}***@${domain}`;
    }
}
