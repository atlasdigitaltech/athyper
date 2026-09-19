import { createHash, randomUUID } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type {
  AuthorizationManagementCommand as Command,
  AuthorizationManagementRepository,
  AuthorizationMutationReceipt,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";

type Row = Record<string, unknown>;
type Spec = {
  table: string;
  fields?: readonly string[];
  action:
    "create" | "update" | "delete" | "status" | "approve" | "revoke" | "device";
  status?: string;
};
const definitions: Record<string, Spec> = {};
for (const [prefix, table, fields] of [
  ["role", "role", ["code", "name", "description", "metadata"]],
  ["group", "principal_group", ["code", "name", "description", "metadata"]],
  [
    "scopeTarget",
    "scope_target",
    [
      "scopeKind",
      "scopeKey",
      "targetId",
      "parentScopeTargetId",
      "displayName",
      "metadata",
    ],
  ],
] as const) {
  definitions[`${prefix}.create`] = { table, action: "create", fields };
  definitions[`${prefix}.update`] = {
    table,
    action: "update",
    fields:
      prefix === "scopeTarget"
        ? ["parentScopeTargetId", "displayName", "metadata"]
        : ["name", "description", "metadata"],
  };
  for (const [verb, status] of [
    ["activate", "active"],
    ["suspend", "suspended"],
    ["retire", "retired"],
  ])
    definitions[`${prefix}.${verb}`] = {
      table,
      action: "status",
      status: status!,
    };
}
for (const [kind, table, fields] of [
  ["role.permission.assign", "role_permission", ["roleId", "permissionId"]],
  ["group.member.add", "group_member", ["groupId", "principalId", "metadata"]],
  [
    "group.role.assign",
    "group_role",
    ["groupId", "roleId", "scopeTargetId", "propagationMode", "metadata"],
  ],
  [
    "deny.create",
    "deny_rule",
    [
      "permissionId",
      "scopeTargetId",
      "subjectKind",
      "principalId",
      "groupId",
      "reason",
      "metadata",
    ],
  ],
  [
    "delegation.create",
    "delegation",
    ["delegatorId", "delegateId", "reason", "approvalTicket", "metadata"],
  ],
  [
    "delegation.grant.assign",
    "delegation_grant",
    ["delegationId", "permissionId", "scopeTargetId"],
  ],
  [
    "override.request",
    "override",
    [
      "principalId",
      "permissionId",
      "scopeTargetId",
      "reason",
      "approvalTicket",
      "metadata",
    ],
  ],
  [
    "acl.grant",
    "record_acl",
    [
      "resourceCode",
      "recordId",
      "permissionId",
      "subjectKind",
      "principalId",
      "groupId",
      "reason",
      "metadata",
    ],
  ],
] as const)
  definitions[kind] = { table, action: "create", fields };
for (const [kind, table] of [
  ["role.permission.revoke", "role_permission"],
  ["delegation.grant.revoke", "delegation_grant"],
])
  definitions[kind!] = { table: table!, action: "delete" };
for (const [kind, table] of [
  ["group.member.revoke", "group_member"],
  ["group.role.revoke", "group_role"],
  ["deny.revoke", "deny_rule"],
])
  definitions[kind!] = { table: table!, action: "status", status: "revoked" };
for (const [kind, table] of [
  ["delegation.revoke", "delegation"],
  ["override.revoke", "override"],
  ["acl.revoke", "record_acl"],
])
  definitions[kind!] = { table: table!, action: "revoke" };
definitions["override.approve"] = { table: "override", action: "approve" };
definitions["trustedDevice.revoke"] = {
  table: "trusted_device",
  action: "device",
};
const timed = new Set([
  "group_member",
  "group_role",
  "deny_rule",
  "delegation",
  "override",
  "record_acl",
]);

/** Canonical plane-local authority only. This adapter is never a legacy fallback. */
export class KyselyAuthorizationManagementRepository implements AuthorizationManagementRepository {
  readonly planeKey;
  lastReceipt: AuthorizationMutationReceipt | undefined;
  constructor(
    private readonly tx: Transaction<Record<string, never>>,
    private readonly context: VerifiedRequestContext,
  ) {
    this.planeKey = context.planeKey;
  }
  private verify(context: VerifiedRequestContext) {
    if (
      context.tenantId !== this.context.tenantId ||
      context.planeKey !== this.planeKey ||
      context.principalId !== this.context.principalId
    )
      throw failure("AUTHZ_CONTEXT_MISMATCH", 403);
  }
  async readOverrideRequest(context: VerifiedRequestContext, id: string) {
    this.verify(context);
    const row = (
      await sql<Row>`SELECT created_by,status FROM authz.override WHERE tenant_id=${context.tenantId}::uuid AND id=${id}::uuid FOR UPDATE`.execute(
        this.tx,
      )
    ).rows[0];
    return row
      ? {
          requestedBy: String(row["created_by"]),
          status: String(row["status"]),
        }
      : undefined;
  }
  async findReceipt(
    command: Command,
  ): Promise<AuthorizationMutationReceipt | undefined> {
    this.verify(command.context);
    const row = (
      await sql<Row>`SELECT * FROM authz.management_receipt WHERE tenant_id=${this.context.tenantId}::uuid AND idempotency_key=${command.idempotencyKey}`.execute(
        this.tx,
      )
    ).rows[0];
    if (!row) return undefined;
    if (row["fingerprint"] !== fingerprint(command))
      throw failure("AUTHZ_IDEMPOTENCY_CONFLICT", 409);
    return (this.lastReceipt = {
      commandId: String(row["command_id"]),
      resourceId: String(row["resource_id"]),
      version: Number(row["resource_version"]),
      replayed: true,
    });
  }
  private async requireCustomRole(id: unknown) {
    const row = (
      await sql<Row>`SELECT role_kind FROM authz.role WHERE tenant_id=${this.context.tenantId}::uuid AND id=${id}::uuid FOR UPDATE`.execute(
        this.tx,
      )
    ).rows[0];
    if (!row) throw failure("AUTHZ_RESOURCE_NOT_FOUND", 404);
    if (row["role_kind"] !== "custom")
      throw failure("AUTHZ_MANAGED_RESOURCE", 403);
  }
  async preview(command: Command) {
    // The unit of work owns a savepoint and rolls all preview effects back.
    await this.apply(command);
    return { accepted: true, normalizedHash: fingerprint(command) };
  }
  async apply(command: Command): Promise<AuthorizationMutationReceipt> {
    this.verify(command.context);
    const replay = await this.findReceipt(command);
    if (replay) return replay;
    // Compiler projections must be published with their signed runtime descriptor.
    if (
      command.kind === "entityOperation.publish" ||
      command.kind === "entityScopeBinding.publish"
    )
      throw failure("AUTHZ_COMPILER_PUBLICATION_REQUIRED", 403);
    // Remembered-browser tokens are issued by IAM after a fresh step-up, not
    // created from an administrator-supplied hash through this generic route.
    if (command.kind === "trustedDevice.register")
      throw failure("AUTHZ_DEVICE_ENROLLMENT_REQUIRED", 403);
    const spec = definitions[command.kind];
    if (!spec) throw failure("AUTHZ_UNSUPPORTED_COMMAND", 400);
    const allowed = new Set(
      spec.fields ??
        (spec.action === "revoke" || spec.action === "device"
          ? ["reason"]
          : []),
    );
    for (const key of Object.keys(command.payload))
      if (!allowed.has(key)) throw failure("AUTHZ_INVALID_PAYLOAD", 400);
    const tenant = this.context.tenantId,
      actor = this.context.principalId;
    const table = sql.table(`authz.${spec.table}`);
    let result: Row;
    if (spec.action === "create") {
      if (command.expectedVersion !== undefined)
        throw failure("AUTHZ_INVALID_VERSION", 400);
      const values: Row = {
        id: command.resourceId ?? randomUUID(),
        tenant_id: tenant,
        created_by: actor,
      };
      for (const [key, value] of Object.entries(command.payload))
        values[snake(key)] = value;
      if (timed.has(spec.table)) {
        if (command.effectiveFrom !== undefined)
          values["effective_from"] = command.effectiveFrom;
        if (command.effectiveUntil !== undefined)
          values["effective_until"] = command.effectiveUntil;
      } else if (
        command.effectiveFrom !== undefined ||
        command.effectiveUntil !== undefined
      )
        throw failure("AUTHZ_INVALID_EFFECTIVE_RANGE", 400);
      if (spec.table === "record_acl") values["granted_by"] = actor;
      if (spec.table === "role_permission")
        await this.requireCustomRole(values["role_id"]);
      const columns = Object.keys(values);
      result = (
        await sql<Row>`INSERT INTO ${table}(${sql.join(columns.map((c) => sql.ref(c)))}) VALUES(${sql.join(columns.map((c) => (c === "metadata" ? sql`${JSON.stringify(values[c])}::jsonb` : sql`${values[c]}`)))}) RETURNING *`.execute(
          this.tx,
        )
      ).rows[0]!;
    } else {
      if (
        !command.resourceId ||
        !Number.isSafeInteger(command.expectedVersion) ||
        command.expectedVersion! <= 0
      )
        throw failure("AUTHZ_INVALID_VERSION", 400);
      if (
        command.effectiveFrom !== undefined ||
        command.effectiveUntil !== undefined
      )
        throw failure("AUTHZ_INVALID_EFFECTIVE_RANGE", 400);
      const old = (
        await sql<Row>`SELECT * FROM ${table} WHERE tenant_id=${tenant}::uuid AND id=${command.resourceId}::uuid FOR UPDATE`.execute(
          this.tx,
        )
      ).rows[0];
      if (!old) throw failure("AUTHZ_RESOURCE_NOT_FOUND", 404);
      if (Number(old["version"]) !== command.expectedVersion)
        throw failure("AUTHZ_WRITE_CONFLICT", 409);
      if (
        ["retired", "revoked"].includes(String(old["status"])) ||
        old["revoked_at"]
      )
        throw failure("AUTHZ_TERMINAL_RESOURCE", 409);
      if (
        (spec.table === "role" && old["role_kind"] !== "custom") ||
        (spec.table === "principal_group" && old["group_kind"] !== "custom")
      )
        throw failure("AUTHZ_MANAGED_RESOURCE", 403);
      if (spec.table === "role_permission")
        await this.requireCustomRole(old["role_id"]);
      if (spec.action === "delete") {
        await sql`DELETE FROM ${table} WHERE tenant_id=${tenant}::uuid AND id=${command.resourceId}::uuid AND version=${command.expectedVersion}`.execute(
          this.tx,
        );
        result = {
          id: command.resourceId,
          version: command.expectedVersion! + 1,
        };
      } else {
        const changes: Row = {};
        if (spec.action === "update")
          for (const [key, value] of Object.entries(command.payload))
            changes[snake(key)] = value;
        if (spec.action === "status") changes["status"] = spec.status;
        if (spec.action === "approve") {
          if (old["status"] !== "pending")
            throw failure("AUTHZ_OVERRIDE_NOT_PENDING", 409);
          if (old["created_by"] === actor)
            throw failure("AUTHZ_APPROVER_SEPARATION_REQUIRED", 403);
          changes["status"] = "active";
          changes["approved_by"] = actor;
          changes["approved_at"] = sql`clock_timestamp()`;
        }
        if (spec.action === "revoke" || spec.action === "device") {
          if (
            typeof command.payload["reason"] !== "string" ||
            !command.payload["reason"].trim()
          )
            throw failure("AUTHZ_REASON_REQUIRED", 400);
          if (spec.action === "revoke") changes["status"] = "revoked";
          changes["revoked_by"] = actor;
          changes["revoked_at"] = sql`clock_timestamp()`;
          changes["revocation_reason"] = command.payload["reason"];
        }
        if (!Object.keys(changes).length)
          throw failure("AUTHZ_INVALID_PAYLOAD", 400);
        if (spec.table !== "trusted_device") {
          changes["updated_by"] = actor;
          changes["updated_at"] = sql`clock_timestamp()`;
        }
        result = (
          await sql<Row>`UPDATE ${table} SET ${sql.join(Object.entries(changes).map(([key, value]) => sql`${sql.ref(key)}=${key === "metadata" ? sql`${JSON.stringify(value)}::jsonb` : value}`))} WHERE tenant_id=${tenant}::uuid AND id=${command.resourceId}::uuid AND version=${command.expectedVersion} RETURNING *`.execute(
            this.tx,
          )
        ).rows[0]!;
      }
    }
    const receipt = {
      commandId: command.commandId,
      resourceId: String(result["id"]),
      version: Number(result["version"]),
      replayed: false,
    };
    await sql`INSERT INTO authz.management_receipt(tenant_id,idempotency_key,command_id,principal_id,fingerprint,resource_id,resource_version,mutation_kind) VALUES(${tenant}::uuid,${command.idempotencyKey},${command.commandId},${actor}::uuid,${fingerprint(command)},${receipt.resourceId}::uuid,${receipt.version},${command.kind})`.execute(
      this.tx,
    );
    this.lastReceipt = receipt;
    return receipt;
  }
}
function snake(key: string) {
  return key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}
function fingerprint(command: Command): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonical({
          tenant: command.context.tenantId,
          plane: command.context.planeKey,
          principal: command.context.principalId,
          kind: command.kind,
          commandId: command.commandId,
          resourceId: command.resourceId,
          expectedVersion: command.expectedVersion,
          effectiveFrom: command.effectiveFrom,
          effectiveUntil: command.effectiveUntil,
          payload: command.payload,
        }),
      ),
    )
    .digest("hex");
}
function canonical(value: unknown, depth = 0): unknown {
  if (depth > 64) throw failure("AUTHZ_INVALID_PAYLOAD", 400);
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "boolean"
  )
    return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value))
    return value.map((item) => canonical(item, depth + 1));
  if (
    value &&
    typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  )
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v, depth + 1)]),
    );
  throw failure("AUTHZ_INVALID_PAYLOAD", 400);
}
function failure(code: string, status: number) {
  return Object.assign(new Error(code), { code, status });
}
