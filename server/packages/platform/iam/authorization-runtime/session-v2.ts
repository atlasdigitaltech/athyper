import { createHash } from "node:crypto";

import { sql, type Kysely } from "kysely";

import {
  CANONICAL_AUTHORIZATION_CONTRACT_VERSION,
  type CanonicalDecisionRequest,
  type CanonicalPlane,
  type CollectionMaterialization,
} from "../authorization-evaluator/index.js";
import type {
  AuthorizationDecisionEnvelope,
  ProductionAuthorizationDecisionApi,
} from "./types.js";

type AnyDb = Kysely<Record<string, never>>;

export const AUTHORIZATION_SESSION_CONTRACT_VERSION =
  "wave5.authorization-session.v2" as const;

export interface ExternalSessionIdentity {
  readonly externalSubjectId: string;
  readonly realmKey: string;
  readonly tenantId: string;
  readonly tenantOrAccountId: string;
  readonly plane: CanonicalPlane;
}

export interface ResolvedSessionIdentity {
  readonly principalId: string;
  readonly identityBindingId: string;
}

export interface SessionV2IdentityRepository {
  resolve(input: ExternalSessionIdentity): Promise<ResolvedSessionIdentity | null>;
}

export interface SessionCatalogEntry {
  readonly permissionId: string;
  readonly canonicalCode: string;
  readonly entityOperationId?: string;
}

export interface SessionCatalogSnapshot {
  readonly catalogVersion: string;
  readonly entries: readonly SessionCatalogEntry[];
}

export interface SessionV2CatalogRepository {
  load(input: {
    readonly plane: CanonicalPlane;
    readonly tenantId?: string;
    readonly tenantOrAccountId: string;
    readonly evaluatedAt: Date;
  }): Promise<SessionCatalogSnapshot>;
}

export interface AuthorizationSessionDecisionEntry {
  readonly permissionId: string;
  readonly canonicalCode: string;
  readonly entityOperationId?: string;
  readonly available: boolean;
  readonly decision: "allow" | "deny";
  readonly reason: string;
  readonly organizationalScope?: CollectionMaterialization;
  readonly evidence: AuthorizationDecisionEnvelope["result"]["evidence"];
  readonly authorizationFingerprint: string;
}

export interface AuthorizationSessionV2 {
  readonly contractVersion: typeof AUTHORIZATION_SESSION_CONTRACT_VERSION;
  readonly evaluatorContractVersion: string;
  readonly plane: CanonicalPlane;
  readonly tenantOrAccountId: string;
  readonly principalId: string;
  readonly identityBindingId: string;
  readonly catalogVersion: string;
  readonly policyVersions: readonly string[];
  readonly authorizationFingerprint: string;
  readonly decisions: readonly AuthorizationSessionDecisionEntry[];
  readonly resolvedAt: string;
  readonly expiresAt: string;
  readonly nextAuthorityChangeAt?: string;
}

export class ProductionAuthorizationSessionV2Service {
  constructor(
    private readonly identityRepository: SessionV2IdentityRepository,
    private readonly catalogRepository: SessionV2CatalogRepository,
    private readonly decisions: ProductionAuthorizationDecisionApi,
    private readonly maxTtlSeconds = 300,
  ) {}

  async resolve(
    input: ExternalSessionIdentity & {
      readonly evaluatedAt?: Date;
      readonly mfaSatisfied: boolean;
      readonly sodSatisfied: boolean;
    },
  ): Promise<AuthorizationSessionV2> {
    const evaluatedAt = input.evaluatedAt ?? new Date();
    const identity = await this.identityRepository.resolve(input);
    if (!identity) throw new Error("session identity is not active and local");
    const catalog = await this.catalogRepository.load({
      plane: input.plane,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      tenantOrAccountId: input.tenantOrAccountId,
      evaluatedAt,
    });
    const requests: CanonicalDecisionRequest[] = catalog.entries.map(
      (entry, index) => entry.entityOperationId
        ? {
            requestId: `session:${index}:${entry.entityOperationId}`,
            mode: "collection",
            subject: {
              plane: input.plane,
              tenantId: input.tenantId,
              tenantOrAccountId: input.tenantOrAccountId,
              principalId: identity.principalId,
            },
            evaluatedAt,
            assurance: {
              mfaSatisfied: input.mfaSatisfied,
              sodSatisfied: input.sodSatisfied,
            },
            entityOperationId: entry.entityOperationId,
          }
        : {
            requestId: `session:${index}:${entry.permissionId}`,
            mode: "registered_capability",
            subject: {
              plane: input.plane,
              tenantId: input.tenantId,
              tenantOrAccountId: input.tenantOrAccountId,
              principalId: identity.principalId,
            },
            evaluatedAt,
            assurance: {
              mfaSatisfied: input.mfaSatisfied,
              sodSatisfied: input.sodSatisfied,
            },
            permissionId: entry.permissionId,
          },
    );
    const batch = await this.decisions.decideBatch(requests);
    if (batch.results.length !== catalog.entries.length) {
      throw new Error("session decision batch is incomplete");
    }
    const entries = batch.results.map((envelope, index) => {
      const catalogEntry = catalog.entries[index]!;
      if (
        envelope.result.evidence.permissionId !== catalogEntry.permissionId
        || envelope.result.evidence.canonicalCode !==
          catalogEntry.canonicalCode
        || envelope.result.evidence.catalogVersion !== catalog.catalogVersion
      ) {
        throw new Error("session and evaluator catalog versions diverged");
      }
      if (envelope.result.mode === "collection") {
        const organizational =
          envelope.result.materialization.organizationalAllowClauses.length > 0;
        return {
          permissionId: catalogEntry.permissionId,
          canonicalCode: catalogEntry.canonicalCode,
          ...(catalogEntry.entityOperationId
            ? { entityOperationId: catalogEntry.entityOperationId }
            : {}),
          // ACL-only collection access is never advertised as a global
          // capability. Exact shared records remain in the materialization.
          available: envelope.result.decision === "allow" && organizational,
          decision: organizational ? "allow" as const : "deny" as const,
          reason: organizational
            ? envelope.result.reason
            : envelope.result.materialization.sharedRecords.length > 0
            ? "acl_record_only"
            : envelope.result.reason,
          organizationalScope: envelope.result.materialization,
          evidence: envelope.result.evidence,
          authorizationFingerprint: envelope.authorizationFingerprint,
        };
      }
      return {
        permissionId: catalogEntry.permissionId,
        canonicalCode: catalogEntry.canonicalCode,
        available: envelope.result.decision === "allow",
        decision: envelope.result.decision,
        reason: envelope.result.reason,
        evidence: envelope.result.evidence,
        authorizationFingerprint: envelope.authorizationFingerprint,
      };
    });
    const nextAuthorityChangeAt = earliest(entries.flatMap((entry) =>
      entry.evidence.nextAuthorityChangeAt
        ? [entry.evidence.nextAuthorityChangeAt]
        : []
    ));
    const ttlDeadline = new Date(
      evaluatedAt.getTime() + this.maxTtlSeconds * 1_000,
    );
    const expiresAt = nextAuthorityChangeAt
      && nextAuthorityChangeAt < ttlDeadline
      ? nextAuthorityChangeAt
      : ttlDeadline;
    const policyVersions = [...new Set(
      entries.map((entry) => entry.evidence.policyVersion),
    )].sort();
    const authorizationFingerprint = createHash("sha256").update(
      JSON.stringify({
        plane: input.plane,
        tenantOrAccountId: input.tenantOrAccountId,
        principalId: identity.principalId,
        catalogVersion: catalog.catalogVersion,
        policyVersions,
        decisions: entries
          .map((entry) => ({
            permissionId: entry.permissionId,
            available: entry.available,
            fingerprint: entry.authorizationFingerprint,
          }))
          .sort((left, right) =>
            left.permissionId.localeCompare(right.permissionId)
          ),
      }),
    ).digest("hex");
    return {
      contractVersion: AUTHORIZATION_SESSION_CONTRACT_VERSION,
      evaluatorContractVersion: batch.contractVersion,
      plane: input.plane,
      tenantOrAccountId: input.tenantOrAccountId,
      principalId: identity.principalId,
      identityBindingId: identity.identityBindingId,
      catalogVersion: catalog.catalogVersion,
      policyVersions,
      authorizationFingerprint,
      decisions: entries,
      resolvedAt: evaluatedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      ...(nextAuthorityChangeAt
        ? { nextAuthorityChangeAt: nextAuthorityChangeAt.toISOString() }
        : {}),
    };
  }
}

export class SqlSessionV2IdentityRepository
  implements SessionV2IdentityRepository {
  constructor(
    private readonly db: AnyDb,
    private readonly plane: CanonicalPlane,
  ) {}

  async resolve(
    input: ExternalSessionIdentity,
  ): Promise<ResolvedSessionIdentity | null> {
    if (input.plane !== this.plane) {
      throw new Error("session identity repository rejects cross-plane input");
    }
    return this.db.transaction().execute(async (trx) => {
      await sql`
        SELECT
          set_config('app.current_tenant_id', ${input.tenantId}, true),
          set_config('app.database_plane', ${input.plane === "admin" ? "athyper" : input.plane}, true)
      `.execute(trx);
      const result = await sql<{
        principal_id: string;
        identity_binding_id: string;
      }>`
        SELECT
          resolved.principal_id::text,
          binding.id::text AS identity_binding_id
        FROM master.fn_resolve_principal_identity(
          ${input.tenantId}::uuid,
          'keycloak'::master.identity_provider_d,
          ${input.realmKey},
          ${input.externalSubjectId}
        ) AS resolved
        JOIN master.principal_identity_binding AS binding
          ON binding.tenant_id = ${input.tenantId}::uuid
         AND binding.principal_id = resolved.principal_id
         AND binding.provider_code = 'keycloak'
         AND binding.realm_key = lower(btrim(${input.realmKey}))
         AND binding.subject_id = btrim(${input.externalSubjectId})
         AND binding.status = 'active'
        JOIN authz.plane_membership AS membership
          ON membership.tenant_id = binding.tenant_id
         AND membership.principal_id = resolved.principal_id
         AND membership.status = 'active'
         AND membership.effective_from <= statement_timestamp()
         AND (membership.effective_until IS NULL OR membership.effective_until > statement_timestamp())
        LIMIT 1
      `.execute(trx);
      const row = result.rows[0];
      if (!row) return null;

      if (this.plane === "mesh") {
        const scoped = await sql<{ admitted: boolean }>`
          SELECT EXISTS (
            SELECT 1
            FROM authz.group_member AS member
            JOIN authz.group_role AS group_role
              ON group_role.tenant_id = member.tenant_id
             AND group_role.group_id = member.group_id
             AND group_role.status = 'active'
             AND group_role.effective_from <= statement_timestamp()
             AND (group_role.effective_until IS NULL OR group_role.effective_until > statement_timestamp())
            JOIN authz.scope_target AS scope
              ON scope.tenant_id = group_role.tenant_id
             AND scope.id = group_role.scope_target_id
             AND scope.scope_kind = 'network_account'
             AND scope.target_id = ${input.tenantOrAccountId}::uuid
             AND scope.status = 'active'
            WHERE member.tenant_id = ${input.tenantId}::uuid
              AND member.principal_id = ${row.principal_id}::uuid
              AND member.status = 'active'
              AND member.effective_from <= statement_timestamp()
              AND (member.effective_until IS NULL OR member.effective_until > statement_timestamp())
          ) AS admitted
        `.execute(trx);
        if (!scoped.rows[0]?.admitted) return null;
      } else if (input.tenantOrAccountId !== input.tenantId) {
        return null;
      }

      return {
        principalId: row.principal_id,
        identityBindingId: row.identity_binding_id,
      };
    });
  }
}

export class SqlSessionV2CatalogRepository
  implements SessionV2CatalogRepository {
  constructor(
    private readonly db: AnyDb,
    private readonly plane: CanonicalPlane,
  ) {}

  async load(input: {
    readonly plane: CanonicalPlane;
    readonly tenantId?: string;
    readonly tenantOrAccountId: string;
    readonly evaluatedAt: Date;
  }): Promise<SessionCatalogSnapshot> {
    if (input.plane !== this.plane) {
      throw new Error("session catalog repository rejects cross-plane input");
    }
    const result = await this.db.transaction().execute(async (trx) => {
      await sql`
        SELECT
          set_config('app.current_tenant_id', ${input.tenantId ?? input.tenantOrAccountId}, true),
          set_config('app.database_plane', ${input.plane === "admin" ? "athyper" : input.plane}, true)
      `.execute(trx);
      return sql<{
        permission_id: string;
        canonical_code: string;
      }>`
        SELECT DISTINCT id::text AS permission_id, canonical_code
        FROM authz.permission_catalog
        ORDER BY canonical_code
      `.execute(trx);
    });
    return {
      catalogVersion: CANONICAL_AUTHORIZATION_CONTRACT_VERSION,
      entries: result.rows.map((row) => ({
        permissionId: row.permission_id,
        canonicalCode: row.canonical_code,
      })),
    };
  }
}

function earliest(values: readonly Date[]): Date | undefined {
  return [...values].sort(
    (left, right) => left.getTime() - right.getTime(),
  )[0];
}
