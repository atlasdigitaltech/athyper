/**
 * RecipientResolver — Expand recipient rule specs into concrete user addresses.
 *
 * Recipient rule types:
 * - "user": Direct user principal ID
 * - "role": Resolve all users with this role in the tenant
 * - "group": Resolve group members
 * - "expression": Evaluate a dynamic expression against event payload
 *   (e.g., "payload.ownerId", "payload.approvers")
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

export interface ResolvedRecipient {
  principalId: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
}

export interface RecipientSpec {
  type: string; // "user" | "role" | "group" | "expression"
  value: string;
}

export class RecipientResolver {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly logger: Logger,
  ) {}

  /**
   * Resolve a list of recipient specs into concrete recipients.
   * Deduplicates by principalId.
   */
  async resolve(
    tenantId: string,
    specs: RecipientSpec[],
    eventPayload?: Record<string, unknown>,
  ): Promise<ResolvedRecipient[]> {
    const recipientMap = new Map<string, ResolvedRecipient>();

    for (const spec of specs) {
      const resolved = await this.resolveOne(tenantId, spec, eventPayload);
      for (const r of resolved) {
        if (!recipientMap.has(r.principalId)) {
          recipientMap.set(r.principalId, r);
        }
      }
    }

    return Array.from(recipientMap.values());
  }

  private async resolveOne(
    tenantId: string,
    spec: RecipientSpec,
    eventPayload?: Record<string, unknown>,
  ): Promise<ResolvedRecipient[]> {
    switch (spec.type) {
      case "user":
        return this.resolveUser(tenantId, spec.value);
      case "role":
        return this.resolveRole(tenantId, spec.value);
      case "group":
        return this.resolveGroup(tenantId, spec.value);
      case "expression":
        return this.resolveExpression(tenantId, spec.value, eventPayload);
      default:
        this.logger.warn(
          { type: spec.type, value: spec.value },
          "[notify:recipient] Unknown recipient rule type",
        );
        return [];
    }
  }

  /**
   * Direct user lookup by principal ID.
   */
  private async resolveUser(
    tenantId: string,
    principalId: string,
  ): Promise<ResolvedRecipient[]> {
    const qb = this.db as any;
    const row = await qb
      .selectFrom("core.principal")
      .selectAll()
      .where("id", "=", principalId)
      .where("tenant_id", "=", tenantId)
      .where("status", "=", "active")
      .executeTakeFirst();

    if (!row) return [];

    return [
      {
        principalId: row.id,
        email: row.email ?? null,
        phone: row.phone ?? null,
        displayName: row.display_name ?? null,
      },
    ];
  }

  /**
   * Resolve all active users with a given role in the tenant.
   * Uses two queries: resolve role → find principal_role entries → load principals.
   */
  private async resolveRole(
    tenantId: string,
    roleCode: string,
  ): Promise<ResolvedRecipient[]> {
    const qb = this.db as any;

    // Find the role by code
    const role = await qb
      .selectFrom("core.role")
      .selectAll()
      .where("code", "=", roleCode)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    if (!role) return [];

    // Find all principals with this role
    const assignments = await qb
      .selectFrom("core.principal_role")
      .select(["principal_id"])
      .where("role_id", "=", role.id)
      .execute();

    if (assignments.length === 0) return [];

    const principalIds = assignments.map((a: any) => a.principal_id);

    // Load all active principals
    const principals = await qb
      .selectFrom("core.principal")
      .selectAll()
      .where("id", "in", principalIds)
      .where("tenant_id", "=", tenantId)
      .where("status", "=", "active")
      .execute();

    return principals.map((p: any) => ({
      principalId: p.id,
      email: p.email ?? null,
      phone: p.phone ?? null,
      displayName: p.display_name ?? null,
    }));
  }

  /**
   * Resolve all active members of a group.
   */
  private async resolveGroup(
    tenantId: string,
    groupCode: string,
  ): Promise<ResolvedRecipient[]> {
    const qb = this.db as any;

    // Find the group by code
    const group = await qb
      .selectFrom("core.principal_group")
      .selectAll()
      .where("code", "=", groupCode)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    if (!group) return [];

    // Find all members
    const members = await qb
      .selectFrom("core.group_member")
      .select(["principal_id"])
      .where("group_id", "=", group.id)
      .execute();

    if (members.length === 0) return [];

    const principalIds = members.map((m: any) => m.principal_id);

    // Load all active principals
    const principals = await qb
      .selectFrom("core.principal")
      .selectAll()
      .where("id", "in", principalIds)
      .where("tenant_id", "=", tenantId)
      .where("status", "=", "active")
      .execute();

    return principals.map((p: any) => ({
      principalId: p.id,
      email: p.email ?? null,
      phone: p.phone ?? null,
      displayName: p.display_name ?? null,
    }));
  }

  /**
   * Resolve recipients from a dynamic expression evaluated against the event payload.
   *
   * Supports:
   * - "payload.ownerId" → single user ID from payload
   * - "payload.approverIds" → array of user IDs from payload
   */
  private async resolveExpression(
    tenantId: string,
    expression: string,
    eventPayload?: Record<string, unknown>,
  ): Promise<ResolvedRecipient[]> {
    if (!eventPayload) return [];

    const value = this.resolveNestedKey(eventPayload, expression);
    if (!value) return [];

    // Single user ID
    if (typeof value === "string") {
      return this.resolveUser(tenantId, value);
    }

    // Array of user IDs
    if (Array.isArray(value)) {
      const results: ResolvedRecipient[] = [];
      for (const id of value) {
        if (typeof id === "string") {
          const users = await this.resolveUser(tenantId, id);
          results.push(...users);
        }
      }
      return results;
    }

    return [];
  }

  private resolveNestedKey(obj: Record<string, unknown>, key: string): unknown {
    // Strip "payload." prefix if present (since we already have the payload)
    const cleanKey = key.startsWith("payload.") ? key.slice(8) : key;
    const parts = cleanKey.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}
