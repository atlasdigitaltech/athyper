import { isScopeSubset, isValidScope } from "./scope.js";
import type {
  CanonicalPlane,
  ScopeConstraint,
} from "./types.js";

export const WAVE4_EXCEPTION_ENFORCEMENT_STATUS =
  "shadow_not_enforced_until_wave5_consumers_move" as const;

interface ExceptionSubject {
  readonly plane: CanonicalPlane;
  readonly tenantOrAccountId: string;
  readonly principalId: string;
}

export interface CreateAllowOverrideCommand {
  readonly subject: ExceptionSubject;
  readonly permissionId: string;
  readonly scope: ScopeConstraint;
  readonly reason: string;
  readonly approvalTicket: string;
  readonly approvedBy: string;
  readonly approvedAt: Date;
  readonly effectiveFrom: Date;
  readonly effectiveUntil: Date;
}

export interface OverrideWriteFacts {
  readonly exactPermissionActive: boolean;
  readonly scopeActiveAndLocal: boolean;
  readonly planeMembershipActive: boolean;
}

export interface CanonicalOverrideWriterRepository {
  validateOverride(
    command: CreateAllowOverrideCommand,
  ): Promise<OverrideWriteFacts>;
  insertOverride(command: CreateAllowOverrideCommand): Promise<string>;
}

export class CanonicalOverrideService {
  constructor(private readonly repository: CanonicalOverrideWriterRepository) {}

  async createApprovedAllow(
    command: CreateAllowOverrideCommand,
  ): Promise<string> {
    requireText(command.reason, "override reason");
    requireText(command.approvalTicket, "override approval ticket");
    if (!isValidScope(command.scope)) throw new Error("override scope is empty");
    if (command.scope.tenantOrAccountId !== command.subject.tenantOrAccountId) {
      throw new Error("override scope crosses the authority boundary");
    }
    if (
      command.effectiveUntil <= command.effectiveFrom
      || command.approvedAt > command.effectiveFrom
    ) {
      throw new Error("override must be pre-approved and expiring");
    }
    const facts = await this.repository.validateOverride(command);
    if (
      !facts.exactPermissionActive
      || !facts.scopeActiveAndLocal
      || !facts.planeMembershipActive
    ) {
      throw new Error("override target is not currently eligible");
    }
    return this.repository.insertOverride(command);
  }
}

export interface CreateRecordAclCommand {
  readonly subject: ExceptionSubject;
  readonly entityId: string;
  readonly recordId: string;
  readonly permissionIds: readonly string[];
  readonly reason: string;
  readonly grantedBy: string;
  readonly effectiveFrom: Date;
  readonly effectiveUntil?: Date;
}

export interface RecordAclWriteFacts {
  readonly exactEntityActive: boolean;
  readonly subjectActiveAndLocal: boolean;
  readonly allPermissionsExactAndShareable: boolean;
}

export interface CanonicalRecordAclWriterRepository {
  validateRecordAcl(
    command: CreateRecordAclCommand,
  ): Promise<RecordAclWriteFacts>;
  insertRecordAcl(command: CreateRecordAclCommand): Promise<string>;
}

export class CanonicalRecordAclService {
  readonly enforcementStatus = WAVE4_EXCEPTION_ENFORCEMENT_STATUS;

  constructor(
    private readonly repository: CanonicalRecordAclWriterRepository,
  ) {}

  async createShadowAcl(command: CreateRecordAclCommand): Promise<string> {
    requireText(command.reason, "record ACL reason");
    if (command.permissionIds.length === 0) {
      throw new Error("record ACL requires exact permission IDs");
    }
    if (
      new Set(command.permissionIds).size !== command.permissionIds.length
    ) {
      throw new Error("record ACL permission IDs must be unique");
    }
    if (
      command.effectiveUntil
      && command.effectiveUntil <= command.effectiveFrom
    ) {
      throw new Error("record ACL expiry must follow its start");
    }
    const facts = await this.repository.validateRecordAcl(command);
    if (
      !facts.exactEntityActive
      || !facts.subjectActiveAndLocal
      || !facts.allPermissionsExactAndShareable
    ) {
      throw new Error("record ACL target is not exact, local, and shareable");
    }
    return this.repository.insertRecordAcl(command);
  }
}

export interface CreateDelegationCommand {
  readonly plane: CanonicalPlane;
  readonly tenantOrAccountId: string;
  readonly delegatorId: string;
  readonly delegateId: string;
  readonly permissionId: string;
  readonly delegatedScopes: readonly ScopeConstraint[];
  readonly delegatorOrdinaryScopes: readonly ScopeConstraint[];
  readonly ordinaryProofIds: readonly string[];
  readonly reason: string;
  readonly approvalTicket: string;
  readonly approvedBy: string;
  readonly effectiveFrom: Date;
  readonly effectiveUntil: Date;
}

export interface DelegationWriteFacts {
  readonly bothPlaneMembershipsActive: boolean;
  readonly exactPermissionActiveAndDelegable: boolean;
  readonly ordinaryProofsCurrent: boolean;
  readonly ordinaryProofSourceKinds: readonly string[];
}

export interface CanonicalDelegationWriterRepository {
  validateDelegation(
    command: CreateDelegationCommand,
  ): Promise<DelegationWriteFacts>;
  insertDelegation(command: CreateDelegationCommand): Promise<string>;
}

export class CanonicalDelegationService {
  readonly enforcementStatus = WAVE4_EXCEPTION_ENFORCEMENT_STATUS;

  constructor(
    private readonly repository: CanonicalDelegationWriterRepository,
  ) {}

  async createShadowDelegation(
    command: CreateDelegationCommand,
  ): Promise<string> {
    requireText(command.reason, "delegation reason");
    requireText(command.approvalTicket, "delegation approval ticket");
    if (command.delegatorId === command.delegateId) {
      throw new Error("self-delegation is forbidden");
    }
    if (
      command.effectiveUntil <= command.effectiveFrom
      || command.delegatedScopes.length === 0
      || command.delegatorOrdinaryScopes.length === 0
      || command.ordinaryProofIds.length === 0
    ) {
      throw new Error("delegation requires bounded time, scope, and provenance");
    }
    if (
      command.delegatedScopes.some((delegated) =>
        delegated.tenantOrAccountId !== command.tenantOrAccountId
        || !command.delegatorOrdinaryScopes.some((ordinary) =>
          isScopeSubset(delegated, ordinary)
        )
      )
    ) {
      throw new Error("delegated scope exceeds the delegator ordinary scope");
    }
    const facts = await this.repository.validateDelegation(command);
    if (
      !facts.bothPlaneMembershipsActive
      || !facts.exactPermissionActiveAndDelegable
      || !facts.ordinaryProofsCurrent
      || facts.ordinaryProofSourceKinds.some((kind) => kind !== "group_role")
    ) {
      throw new Error(
        "delegation requires current ordinary group-role provenance",
      );
    }
    return this.repository.insertDelegation(command);
  }
}

function requireText(value: string, label: string): void {
  if (value.trim() === "") throw new Error(`${label} is required`);
}
